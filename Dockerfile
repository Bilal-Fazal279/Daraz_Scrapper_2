FROM apify/actor-node-playwright-chrome:24-1.58.2

RUN npm ls @crawlee/core apify puppeteer playwright

COPY --chown=myuser:myuser package*.json Dockerfile ./

RUN node check-playwright-version.mjs

RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

# 👇 IMPORTANT: copy full project
COPY --chown=myuser:myuser . ./

# 👇 ADD THIS LINE (this fixes your issue)
RUN npx prisma generate

CMD ["node", "src/main.js"]