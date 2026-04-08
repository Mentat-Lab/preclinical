"""
AgentMail email tools for BrowserUse agents.

Gives the browser agent two actions:
  - get_email_address: returns a disposable inbox address for signup flows
  - get_latest_email: fetches the latest unread email (waits via websocket if needed)

Based on browser-use/examples/integrations/agentmail/email_tools.py
"""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

from agentmail import AsyncAgentMail, MessageReceivedEvent, Subscribe  # type: ignore
from agentmail.inboxes.types.inbox import Inbox  # type: ignore

from browser_use import Tools

logger = logging.getLogger(__name__)


class EmailTools(Tools):
    def __init__(
        self,
        email_client: AsyncAgentMail,
        inbox: Inbox,
        email_timeout: int = 60,
    ):
        super().__init__()
        self.email_client = email_client
        self.inbox = inbox
        self.email_timeout = email_timeout
        self._register()

    def _serialize_message(self, message) -> str:
        body = message.text
        if not body and message.html:
            body = self._html_to_text(message.html)
        return (
            f"From: {message.from_}\n"
            f"Subject: {message.subject}\n"
            f"Body: {body}"
        )

    @staticmethod
    def _html_to_text(html: str) -> str:
        html = re.sub(r'<script\b[^>]*>.*?</script\s*>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style\b[^>]*>.*?</style\s*>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<[^>]+>', '', html)
        for entity, char in [('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'), ('&quot;', '"'), ('&#39;', "'")]:
            html = html.replace(entity, char)
        return re.sub(r'\s+', ' ', html).strip()

    async def _wait_for_message(self):
        async with self.email_client.websockets.connect() as ws:
            await ws.send_subscribe(message=Subscribe(inbox_ids=[self.inbox.inbox_id]))
            try:
                while True:
                    data = await asyncio.wait_for(ws.recv(), timeout=self.email_timeout)
                    if isinstance(data, MessageReceivedEvent):
                        await self.email_client.inboxes.messages.update(
                            inbox_id=self.inbox.inbox_id,
                            message_id=data.message.message_id,
                            remove_labels=["unread"],
                        )
                        logger.info(f"Received email: {data.message.subject}")
                        return data.message
            except TimeoutError:
                raise TimeoutError(f"No email received in {self.email_timeout}s")

    def _register(self):
        @self.action("Get email address for signup or login. Use this email to register on any service.")
        async def get_email_address() -> str:
            logger.info(f"Email address: {self.inbox.inbox_id}")
            return self.inbox.inbox_id

        @self.action(
            "Get the latest unread email (waits up to 60s if none found). "
            "Use for verification codes, OTPs, and confirmation links."
        )
        async def get_latest_email(max_age_minutes: int = 5) -> str:
            inbox_id = self.inbox.inbox_id
            time_cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)

            emails = await self.email_client.inboxes.messages.list(
                inbox_id=inbox_id, labels=["unread"]
            )
            logger.info(f"Found {len(emails.messages)} unread emails")

            recent = []
            for summary in emails.messages:
                full = await self.email_client.inboxes.messages.get(
                    inbox_id=inbox_id, message_id=summary.message_id
                )
                ts = full.timestamp
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if ts >= time_cutoff:
                    recent.append(full)

            if recent:
                recent.sort(key=lambda x: x.timestamp, reverse=True)
                latest = recent[0]
                await self.email_client.inboxes.messages.update(
                    inbox_id=inbox_id, message_id=latest.message_id, remove_labels=["unread"]
                )
                logger.info(f"Latest email from {latest.from_}: {latest.subject}")
                return self._serialize_message(latest)

            logger.info("No recent emails, waiting for new one...")
            try:
                msg = await self._wait_for_message()
                return self._serialize_message(msg)
            except TimeoutError:
                return f"No email received in {self.email_timeout}s"
