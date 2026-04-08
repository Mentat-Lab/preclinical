.PHONY: setup up down restart chrome logs status clean

CHROME_INSTANCES ?= 5
CHROME_BASE_PORT ?= 9222

# --------------------------------------------------------------------------
# Preclinical
# --------------------------------------------------------------------------

## First-time setup: copy env template + start everything
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ Created .env from .env.example"; \
		echo "  → Edit .env with your API keys, then run 'make up' again if needed"; \
	else \
		echo "• .env already exists, skipping copy"; \
	fi
	@$(MAKE) up

## Start everything (daily driver)
up: chrome
	docker compose up -d
	@echo ""
	@echo "✓ Running — http://localhost:3000"

## Stop everything
down:
	docker compose down
	@# Kill Chrome pool instances
	@for port in $$(seq $(CHROME_BASE_PORT) $$(($(CHROME_BASE_PORT) + $(CHROME_INSTANCES) - 1))); do \
		lsof -ti :$$port 2>/dev/null | xargs kill 2>/dev/null; \
	done
	@echo "✓ Chrome instances stopped"

## Restart (picks up .env changes)
restart: down up

## Launch Chrome pool — one instance per scenario slot
chrome:
	@launched=0; \
	for port in $$(seq $(CHROME_BASE_PORT) $$(($(CHROME_BASE_PORT) + $(CHROME_INSTANCES) - 1))); do \
		if lsof -i :$$port >/dev/null 2>&1; then \
			echo "• Chrome already on port $$port"; \
			launched=$$((launched + 1)); \
		else \
			mkdir -p .chrome-cdp-profile-$$port; \
			if [ "$$(uname)" = "Darwin" ]; then \
				/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
					--remote-debugging-port=$$port --remote-debugging-address=0.0.0.0 --remote-allow-origins=* \
					--user-data-dir="$$(pwd)/.chrome-cdp-profile-$$port" \
					--no-first-run --no-default-browser-check \
					>/dev/null 2>&1 & \
			else \
				google-chrome \
					--remote-debugging-port=$$port --remote-debugging-address=0.0.0.0 --remote-allow-origins=* \
					--user-data-dir="$$(pwd)/.chrome-cdp-profile-$$port" \
					--no-first-run --no-default-browser-check \
					>/dev/null 2>&1 & \
			fi; \
			launched=$$((launched + 1)); \
		fi; \
	done; \
	sleep 3; \
	ready=0; \
	for port in $$(seq $(CHROME_BASE_PORT) $$(($(CHROME_BASE_PORT) + $(CHROME_INSTANCES) - 1))); do \
		if lsof -i :$$port >/dev/null 2>&1; then \
			ready=$$((ready + 1)); \
		fi; \
	done; \
	echo "✓ Chrome pool: $$ready/$(CHROME_INSTANCES) instances ready"

## Tail logs
logs:
	docker compose logs -f --tail=50

## Service health
status:
	@docker compose ps
	@echo ""
	@curl -s http://localhost:9000/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "⚠ BrowserUse not reachable"
	@curl -s http://localhost:3000/health 2>/dev/null && echo "" || echo "⚠ App not reachable"

## Nuke volumes, start fresh
clean:
	docker compose down -v
	@for port in $$(seq $(CHROME_BASE_PORT) $$(($(CHROME_BASE_PORT) + $(CHROME_INSTANCES) - 1))); do \
		lsof -ti :$$port 2>/dev/null | xargs kill 2>/dev/null; \
	done
	@rm -rf .chrome-cdp-profile-*
	@echo "✓ Volumes removed, Chrome stopped — run 'make setup' to start fresh"
