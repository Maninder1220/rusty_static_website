# rusty_static_website
Built a self-contained Rust static web server using Axum. Instead of NGINX, I embedded frontend assets into the compiled binary, so the same binary contains both server logic and website files. It runs independently and was tested directly, with Docker, ctr, and nerdctl.
