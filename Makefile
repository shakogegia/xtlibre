IMAGE_NAME := xtc
CONTAINER_NAME := xtc
DOCKER_REPO ?= shakogegia/xtlibre
PORT ?= 3000
VOLUME_NAME := xtc-data

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
