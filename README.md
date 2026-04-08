<div align="center">

# Verum Intelligence — Backend

**Modular GCC regulatory intelligence API powering AI-driven compliance workflows.**  
Query orchestration, regulatory ingestion, framework comparison, and market-entry services — built for production-grade reliability.

[![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?style=flat-square&logo=fastify)](https://fastify.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Zod](https://img.shields.io/badge/Zod-3.x-3E67B1?style=flat-square)](https://zod.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Integrated-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![License](https://img.shields.io/badge/License-Private-red?style=flat-square)](./LICENSE)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Product Modules Supported](#product-modules-supported)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Surface](#api-surface)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Healthcheck](#healthcheck)
- [Repository Scope](#repository-scope)
- [Development Standard](#development-standard)

---

## Overview

**Verum Intelligence** is a premium regulatory intelligence product for the GCC. This repository is the **backend application** — the server-side foundation that powers all product intelligence and application workflows.

It provides the API layer for:

| Jurisdiction | Coverage |
|---|---|
| **DIFC** | Dubai International Financial Centre |
| **ADGM** | Abu Dhabi Global Market |
| **QFC** | Qatar Financial Centre |
| **KSA** | Kingdom of Saudi Arabia |

The backend is intentionally structured to be modular, explicit, maintainable, and easy to reason about — built for disciplined iteration, not hacked-together growth.

---

## Product Modules Supported

### Query
Server-side foundation for AI-powered, source-aware regulatory query. Handles query routing, AI orchestration, and citation-backed response delivery.

### Dashboard
Backend layer for regulatory monitoring — jurisdiction status, alert generation, update processing, and compliance state serving.

### Comparison
Server-side support for structured multi-jurisdiction comparison. Normalizes framework data across DIFC, ADGM, QFC, and KSA for clean UI delivery.

### Toolkit
Backend support for market-entry guidance — roadmap generation, jurisdiction-aware guidance serving, and structured output delivery.

### Auth / Workspace / Profile
Backend foundation for authenticated product workflows, workspace continuity, session verification, and user context management.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Fastify | 5.x |
| Language | TypeScript | 5.8 |
| Runtime | Node.js | 22.x |
| Validation | Zod | 3.x |
| Auth / Database | Supabase JS | 2.x |
| Dev runner | tsx | 4.x |
| Build tool | tsup | 8.x |

---

## Architecture

The backend is structured around clear modular boundaries — not a monolithic server file.

**Layer ownership:**

| Layer | Responsibility |
|---|---|
| `config/` | Environment loading and runtime configuration |
| `plugins/` | Fastify plugin registration (CORS, sensible, etc.) |
| `routes/` | Thin route handlers — input validation and delegation only |
| `modules/` | Core business logic per product module |
| `services/` | External integrations (OpenAI, Supabase, third-party APIs) |
| `domain/` | Domain type definitions and business rules |
| `ingestion/` | Regulatory document ingestion and processing pipelines |
| `db/` | Database query layer |
| `repositories/` | Persistence boundary — database access abstraction |
| `jobs/` | Background and scheduled job scaffolding |
| `utils/` | Small, genuinely reusable utility functions |

**Core doctrine:**

> Keep the backend modular, explicit, and professionally maintainable.  
> No giant monolithic files. No architecture circus.

- Route files stay thin — they validate and delegate
- Modules own business logic
- Services own external integrations
- Repositories own persistence boundaries
- Source files stay below **~600 lines** whenever reasonably possible

---

## Project Structure

```
verum_BE/
├── src/
│   ├── server.ts               # Server entrypoint
│   ├── app.ts                  # Fastify app factory and plugin registration
│   │
│   ├── config/                 # Environment and runtime configuration
│   ├── plugins/                # Fastify plugins (CORS, sensible, etc.)
│   ├── routes/                 # HTTP route handlers (thin — validate and delegate)
│   │   ├── health.ts           # GET /health
│   │   ├── query.ts            # /api/query
│   │   ├── dashboard.ts        # /api/dashboard
│   │   ├── comparison.ts       # /api/comparison
│   │   ├── toolkit.ts          # /api/toolkit
│   │   ├── auth.ts             # /api/auth
│   │   ├── workspace.ts        # /api/workspace
│   │   └── profile.ts          # /api/profile
│   │
│   ├── modules/                # Business logic per product module
│   ├── services/               # External service integrations (OpenAI, Supabase)
│   ├── domain/                 # Domain types and business rule definitions
│   ├── ingestion/              # Regulatory document ingestion pipelines
│   ├── db/                     # Database query layer
│   ├── repositories/           # Persistence boundary and data access
│   ├── jobs/                   # Background and scheduled jobs
│   └── utils/                  # General-purpose utilities
│
├── supabase/
│   └── migrations/             # Database migration files
│
├── docs/                       # Backend-local technical documentation
├── .env.example                # Environment variable documentation template
├── .gitignore                  # Version control exclusions
├── package.json                # Project metadata and scripts
└── tsconfig.json               # TypeScript compiler configuration
```

---

## API Surface

The backend route surface is organized around product modules:

| Endpoint | Module | Status |
|---|---|---|
| `GET /health` | System | Active |
| `POST /api/query` | AI Query | Scaffolded |
| `GET /api/dashboard` | Dashboard | Scaffolded |
| `GET /api/comparison` | Comparison | Scaffolded |
| `GET /api/toolkit` | Toolkit | Scaffolded |
| `POST /api/auth/*` | Auth | Scaffolded |
| `GET /api/workspace` | Workspace | Scaffolded |
| `GET /api/profile` | Profile | Scaffolded |

> At this stage, module routes return placeholder responses while domain, service, repository, and ingestion layers are being hardened. This is intentional — architecture correctness precedes business logic depth.

---

## Getting Started

### Prerequisites

- **Node.js** 22.x or higher
- **npm** 9.x or higher
- Supabase project (for auth and database)
- OpenAI API key (for query services)

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd verum_BE

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your values

# 4. Start the development server
npm run dev
```

The API will be available at [http://localhost:4000](http://localhost:4000).

```bash
# 5. Verify the server is running
curl http://localhost:4000/health
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

```env
# Server
PORT=4000
HOST=0.0.0.0
NODE_ENV=development

# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_CHAT_MODEL=gpt-5-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

> **Model note:** `gpt-5-mini` and `text-embedding-3-small` are the starting LLM models for initial development and testing. These are intentional baselines — both can be upgraded to higher-capacity models as output quality requirements increase during testing and production hardening.

> **Security:** Never commit real secrets. Only `.env.example` should live in version control. Real `.env` files are excluded via `.gitignore`.

---

## Available Scripts

```bash
npm run dev          # Start development server with hot reload (tsx watch)
npm run build        # Build for production (tsup → dist/)
npm run start        # Start the production build (node dist/server.js)
npm run typecheck    # Run TypeScript type checks without emitting
```

---

## Healthcheck

The backend exposes a health endpoint that can be used to verify the server is running:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{
  "ok": true,
  "service": "Verum Intelligence BE",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## Repository Scope

This repository is the **backend application only**.

| Responsibility | Location |
|---|---|
| HTTP API and query orchestration | **This repository** |
| Business logic and domain rules | **This repository** |
| Regulatory ingestion and retrieval | **This repository** |
| Database access and persistence | **This repository** |
| Auth and session verification | **This repository** |
| Frontend UI and product experience | `verum_FE` |
| Marketing landing page | `verum_FE` |
| Client-side auth flows | `verum_FE` |

---

## Development Standard

This repository is not a toy backend and not a throwaway mock server.

It is the foundation for a serious regulatory intelligence product designed to eventually support:

- [ ] Document ingestion and regulatory source indexing
- [ ] Retrieval and citation formatting
- [ ] AI query orchestration (source-backed responses)
- [ ] Dashboard state generation and jurisdiction monitoring
- [ ] Framework comparison normalization
- [ ] Toolkit and market-entry guide generation
- [ ] Session-aware workspace flows
- [ ] Production deployment and client handoff

**The repository standard:** modular, explicit, stable, readable, backend-first in ownership, and ready for disciplined iteration.

The goal is for the repository itself to communicate quality and seriousness before deeper implementation even begins.

---

<div align="center">

**Verum Intelligence** — Private & Confidential  
Backend foundation. Built for scale, correctness, and professional traceability.

</div>
