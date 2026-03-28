FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod ./
COPY main.go ./

RUN go build -o /product-update-service ./main.go

FROM alpine:3.20

WORKDIR /root/

COPY --from=builder /product-update-service /usr/local/bin/product-update-service

EXPOSE 8080

CMD ["product-update-service"]
