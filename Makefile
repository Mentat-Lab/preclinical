.PHONY: setup up down restart logs status clean nuke seed db-reset

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

## Seed the database (agents + scenarios)
seed:
	@docker compose exec -T db psql -U postgres -d preclinical < server/seed.sql
	@echo "✓ Database seeded"

## Reset database to initial state (drop all data, re-apply schema + seed)
db-reset:
	@docker compose exec -T db psql -U postgres -d preclinical -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	@docker compose exec -T db psql -U postgres -d preclinical < server/schema.sql
	@docker compose exec -T db psql -U postgres -d preclinical < server/seed.sql
	@echo "✓ Database reset to initial state"

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
