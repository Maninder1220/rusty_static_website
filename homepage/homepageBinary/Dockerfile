FROM registry.access.redhat.com/ubi10/ubi-minimal:latest

WORKDIR /app

COPY rust-static-server /app/rust-static-server

EXPOSE 8000

CMD ["/app/rust-static-server", "8000"]