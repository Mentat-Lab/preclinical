.PHONY: setup up down restart chrome chrome-local browseruse-local logs status clean nuke

CHROME_INSTANCES ?= 5
CHROME_BASE_PORT ?= 9222

# --------------------------------------------------------------------------
# Preclinical
# --------------------------------------------------------------------------

## First-time setup: copy env template + start services
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ Created .env from .env.example"; \
		echo "  → Edit .env with your API keys, then run 'make up' again if needed"; \
	else \
		echo "• .env already exists, skipping copy"; \
	fi
	@$(MAKE) up

## Start services (no Chrome — run 'make chrome' separately for browser tests)
up:
	docker compose up -d
	@echo ""
	@echo "✓ Running — http://localhost:3000"
	@echo "  → For browser tests: run 'make chrome' first"

## Stop everything
down:
	docker compose down
	@# Kill Chrome pool instances if running
	@for port in $$(seq $(CHROME_BASE_PORT) $$(($(CHROME_BASE_PORT) + $(CHROME_INSTANCES) - 1))); do \
		lsof -ti :$$port 2>/dev/null | xargs kill 2>/dev/null; \
	done
	@echo "✓ Stopped"

## Restart (picks up .env changes)
restart: down up

## Launch Chrome pool for browser tests (chatgpt.com, claude.ai, etc.)
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
					--disable-background-timer-throttling \
					--disable-renderer-backgrounding \
					--disable-backgrounding-occluded-windows \
					--disable-ipc-flooding-protection \
					>/dev/null 2>&1 & \
			else \
				google-chrome \
					--remote-debugging-port=$$port --remote-debugging-address=0.0.0.0 --remote-allow-origins=* \
					--user-data-dir="$$(pwd)/.chrome-cdp-profile-$$port" \
					--no-first-run --no-default-browser-check \
					--disable-background-timer-throttling \
					--disable-renderer-backgrounding \
					--disable-backgrounding-occluded-windows \
					--disable-ipc-flooding-protection \
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

## Run BrowserUse worker locally (outside Docker — stable CDP)
browseruse-local:
	@echo "Starting BrowserUse worker locally (no Docker)..."
	@./scripts/run-browseruse-local.sh

## Start Chrome pool + local BrowserUse (no Docker browseruse container needed)
chrome-local: chrome browseruse-local

## Tail logs
logs:
	docker compose logs -f --tail=50

## Service health
status:
	@docker compose ps
	@echo ""
	@curl -s http://localhost:9000/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "⚠ BrowserUse not reachable"
	@curl -s http://localhost:3000/health 2>/dev/null && echo "" || echo "⚠ App not reachable"

## Remove volumes + Chrome profiles, restart fresh
clean:
	docker compose down -v
	@for port in $$(seq $(CHROME_BASE_PORT) $$(($(CHROME_BASE_PORT) + $(CHROME_INSTANCES) - 1))); do \
		lsof -ti :$$port 2>/dev/null | xargs kill 2>/dev/null; \
	done
	@rm -rf .chrome-cdp-profile-*
	@echo "✓ Volumes removed, Chrome stopped — run 'make setup' to start fresh"

## Destroy everything (containers, images, volumes, profiles) + rebuild from scratch
nuke:
	@echo "Nuking everything..."
	docker compose down -v --rmi all --remove-orphans
	@for port in $$(seq $(CHROME_BASE_PORT) $$(($(CHROME_BASE_PORT) + $(CHROME_INSTANCES) - 1))); do \
		lsof -ti :$$port 2>/dev/null | xargs kill 2>/dev/null; \
	done
	@rm -rf .chrome-cdp-profile-*
	@echo "✓ Everything destroyed — rebuilding..."
	@$(MAKE) setup
