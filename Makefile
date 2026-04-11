.PHONY: setup up down restart logs status clean nuke

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

## Start services
up:
	docker compose up -d
	@echo ""
	@echo "✓ Running — http://localhost:3000"

## Stop everything
down:
	docker compose down
	@echo "✓ Stopped"

## Restart (picks up .env changes)
restart: down up

## Tail logs
logs:
	docker compose logs -f --tail=50

## Service health
status:
	@docker compose ps
	@echo ""
	@curl -s http://localhost:3000/health 2>/dev/null && echo "" || echo "⚠ App not reachable"

## Remove volumes, restart fresh
clean:
	docker compose down -v
	@echo "✓ Volumes removed — run 'make setup' to start fresh"

## Destroy everything (containers, images, volumes) + rebuild from scratch
nuke:
	@echo "Nuking everything..."
	docker compose down -v --rmi all --remove-orphans
	@echo "✓ Everything destroyed — rebuilding..."
	@$(MAKE) setup
