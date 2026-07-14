# Multi-stage: compile with the full Go toolchain, ship just the
# static binary. CGO_ENABLED=0 since pgx and go-redis are pure Go —
# no cgo, so this also works unchanged on the alpine (musl) runtime
# stage below.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /scraper-go .

FROM alpine:3.20
# ca-certificates: scraper-go makes outbound HTTPS calls (Flipp's API)
# and a TLS connection to Supabase's Postgres pooler — without this,
# certificate verification fails.
RUN apk add --no-cache ca-certificates
COPY --from=build /scraper-go /scraper-go
EXPOSE 8080
CMD ["/scraper-go"]
