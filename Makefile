IMAGE_NAME := xtlibre
CONTAINER_NAME := xtlibre
DOCKER_REPO ?= shakogegia/xtlibre
PORT ?= 3000
VOLUME_NAME := xtlibre-data

RUN_ENV :=
ifdef AUTH_USERNAME
RUN_ENV += -e AUTH_USERNAME=$(AUTH_USERNAME)
endif
ifdef AUTH_PASSWORD
RUN_ENV += -e AUTH_PASSWORD=$(AUTH_PASSWORD)
endif
ifdef PUBLIC_URL
RUN_ENV += -e PUBLIC_URL=$(PUBLIC_URL)
endif
ifdef DATA_DIR
RUN_ENV += -e DATA_DIR=$(DATA_DIR)
endif

.PHONY: dev build run stop logs push clean shell

## Development
dev:
	pnpm dev

## Docker
build:
	docker build -t $(IMAGE_NAME) .

run: build
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(PORT):3000 \
		$(RUN_ENV) \
		-v $(VOLUME_NAME):/data \
		$(IMAGE_NAME)
	@echo "Running at http://localhost:$(PORT)"

stop:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)

shell:
	docker exec -it $(CONTAINER_NAME) sh

push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(DOCKER_REPO):latest --push .

clean: stop
	-docker rmi $(IMAGE_NAME)
	-docker volume rm $(VOLUME_NAME)
