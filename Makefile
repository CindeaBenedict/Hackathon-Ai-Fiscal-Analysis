.PHONY: start stop restart logs build qa

start:        ## Start everything (Docker + Ollama + open browser)
	@./start.sh

stop:         ## Stop all containers
	@./stop.sh

restart: stop start  ## Restart from scratch

logs:         ## Follow live container logs
	@docker compose logs -f

build:        ## Rebuild images without starting
	@docker compose build

qa:           ## Run Puppeteer smoke tests
	@docker compose --profile qa run --rm puppeteer-smoke

help:         ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
