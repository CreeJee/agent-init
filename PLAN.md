# Agent Context Hub - 구현 계획서

## 프로젝트 개요

팀 간 AI 컨텍스트 공유를 위한 MCP 서버. PM/PO/FE/BE/DESIGN/SALES 등이 `.agent-init` 디렉토리에 마크다운 문서를 작성하면, Claude가 자동으로 검색하고 활용할 수 있도록 지원.

## 프로젝트 상태

✅ Hono + @hono/mcp 골조 완성
✅ Docker 설정 완료
⏳ 비즈니스 로직 구현 필요

---

## 핵심 아키텍처

### 전략: Hybrid Approach (Tools + ResourceLinks)

- ✅ MCP Tools로 문서 검색/발견 (Claude 자동 호출 가능)
- ✅ Preview + ResourceLink 패턴 (토큰 효율성)
- ✅ HTTP API로 전체 내용 제공 (스트리밍 지원)
- ✅ JWT 인증으로 팀별 격리
- ❌ MCP Resources 직접 노출 (UX 문제로 배제)

### 왜 이 전략인가?

#### 조사 결과 요약

1. **SSE Transport는 Deprecated** (2024-11-05부터)
   - Streamable HTTP Transport로 대체됨
   - `@hono/mcp`가 공식 지원

2. **MCP Resources의 한계**
   - Claude Desktop에서 수동 선택 필요 (자동 발견 불가)
   - 100+ 파일 관리 시 UX 문제
   - 프로덕션 MCP 서버들은 대부분 Tools 사용

3. **ResourceLink 패턴이 Best Practice**
   - Preview (500자) + ResourceLink 제공
   - 토큰 효율성: 큰 파일도 작은 비용으로 처리
   - Claude의 Prompt Caching 활용 (>1024 토큰)

4. **Tools가 더 나은 UX**
   - Claude가 필요시 자동으로 호출
   - 검색/필터링 가능
   - 자연스러운 대화 흐름

---

## 기술 스택

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.2",
    "@hono/mcp": "^0.1.5",
    "hono": "^4.10.4",
    "@hono/node-server": "^1.19.6",
    "valibot": "latest",
    "jose": "latest"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "tsx": "^4.7.1",
    "@types/node": "^20.11.17",
    "vitest": "latest"
  }
}
```

---

## 프로젝트 구조

```
agent-init/
├── src/
│   ├── index.ts              # Hono 서버 (완료)
│   ├── mcp.ts                # McpServer 인스턴스 (완료)
│   ├── storage/
│   │   ├── filesystem.ts     # .agent-init 스캔/읽기/쓰기
│   │   └── cache.ts          # 인메모리 캐시 (Map)
│   ├── tools/
│   │   ├── search-docs.ts    # 문서 검색 (메인 기능)
│   │   ├── list-teams.ts     # 팀 목록
│   │   ├── recent-updates.ts # 최근 변경 문서
│   │   └── write-context.ts  # 문서 작성/수정 (AI 업데이트용)
│   ├── auth/
│   │   └── jwt.ts            # JWT 검증 + 팀 격리
│   ├── api/
│   │   └── context.ts        # HTTP 엔드포인트 (ResourceLink 해결)
│   ├── schemas.ts            # Valibot 스키마
│   └── types.ts              # TypeScript 타입
├── .agent-init/              # 컨텍스트 저장소
│   ├── PM/
│   ├── BE/
│   ├── FE/
│   └── DESIGN/
├── package.json              # (완료)
├── tsconfig.json             # (완료)
├── Dockerfile                # (완료)
├── .env.example
└── README.md
```

---

## 구현할 핵심 로직

### 1. JWT 인증 레이어

**파일**: `src/auth/jwt.ts`

- JWT 토큰 검증 (jose 라이브러리)
- team_id, permissions 추출
- Hono 미들웨어 제공

**JWT 페이로드 구조:**
```typescript
{
  sub: "user-id",
  team_id: "engineering",
  project_id: "product-x",
  permissions: ["read:docs", "write:docs"],
  exp: 1234567890
}
```

### 2. 파일시스템 스토리지

**파일**: `src/storage/filesystem.ts`

- `.agent-init/{team}/**/*.md` 스캔
- 팀별 격리 (JWT team_id 기반)
- 파일 읽기/쓰기
- 인메모리 캐싱 (Map, 5분 TTL)
- 경로 탐색 공격 방지 (`../` 차단)

**주요 메서드:**
- `scanDocuments(teamId?: string)`: 문서 스캔
- `readDocument(team: string, file: string)`: 문서 읽기
- `writeDocument(team: string, file: string, content: string)`: 문서 쓰기
- `searchDocuments(query: string, teamId?: string)`: 문서 검색

### 3. Valibot 스키마

**파일**: `src/schemas.ts`

- SearchDocsInput
- WriteContextInput
- ListTeamsInput
- 공통 응답 타입

### 4. MCP Tools

#### search_docs

**파일**: `src/tools/search-docs.ts`

- 문서 검색 (제목, 내용)
- Preview + ResourceLink 패턴
- 파일 크기별 전략:
  - **<5KB**: 전체 반환 (Prompt Cache 활용)
  - **5-50KB**: Preview (500자) + ResourceLink
  - **>50KB**: 메타데이터만

**입력:**
```typescript
{
  query: string
  team?: string
  tags?: string[]
}
```

**출력:**
```typescript
{
  results: [{
    title: "API 인증 스펙",
    preview: "# 인증 API\n\n...",
    metadata: {
      team: "BE",
      file: "auth-api.md",
      size: 15360,
      lastModified: "2025-11-01T10:30:00Z"
    },
    resourceLink: {
      uri: "context://BE/auth-api.md",
      mimeType: "text/markdown"
    }
  }],
  totalCount: 1
}
```

#### list_teams

**파일**: `src/tools/list-teams.ts`

- 사용 가능한 팀 목록
- 각 팀의 문서 개수, 최근 업데이트 시간

#### recent_updates

**파일**: `src/tools/recent-updates.ts`

- 최근 변경된 문서 (파일 mtime 기준)
- 팀별 필터링 가능

#### write_context

**파일**: `src/tools/write-context.ts`

- 문서 생성/수정
- 권한 확인 (write:docs)
- Outdated 문서 자동 업데이트

### 5. HTTP API

**파일**: `src/api/context.ts`

#### GET /api/context/:team/:file

- ResourceLink 해결
- 전체 마크다운 반환
- 스트리밍 지원 (큰 파일)
- JWT 인증 필수
- 팀 권한 확인

#### PUT /api/context/:team/:file

- 문서 수정
- 권한 확인 (write:docs)
- 캐시 무효화

---

## 구현 순서

1. ✅ **PLAN.md 저장**
2. ⏳ **패키지 설치**: valibot, jose
3. ⏳ **Valibot 스키마** 정의
4. ⏳ **JWT 미들웨어** 구현
5. ⏳ **파일시스템 스토리지** 구현
6. ⏳ **search_docs 툴** 구현 및 mcpServer 등록
7. ⏳ **HTTP API** 엔드포인트
8. ⏳ **추가 툴들** (list_teams, recent_updates, write_context)
9. ⏳ **index.ts 통합** (미들웨어, 라우트)
10. ⏳ **.env.example** 작성
11. ⏳ **샘플 .agent-init** 디렉토리 생성
12. ⏳ **Claude Desktop 테스트**

---

## 보안 & 성능

### 보안

1. **JWT 검증** (모든 요청)
2. **경로 탐색 방지** (`../` 패턴 차단)
3. **팀별 디렉토리 격리**
4. **파일 크기 제한** (1MB 하드 리미트)
5. **권한 기반 접근 제어** (read:docs, write:docs)

### 성능

1. **인메모리 캐싱** (Map, 5분 TTL)
2. **Prompt Caching** (Claude 자동, >1024 토큰)
3. **파일 스트리밍** (큰 파일)
4. **선택적 로딩** (Preview → Full content)

### 캐싱 전략 (3-tier)

1. **서버 메모리**: 자주 접근하는 파일 (Map, 5분 TTL)
2. **Prompt Cache**: Claude의 자동 캐싱 (>1024 토큰, 5분 TTL)
3. **파일시스템**: 원본 소스

---

## 사용 시나리오

### 시나리오 1: Claude가 자동으로 컨텍스트 검색

```
User: "백엔드 인증 API 스펙 보여줘"

Claude: [search_docs tool 자동 호출]
→ { query: "인증 API", team: "BE" }

Server: [Preview + ResourceLink 반환]

Claude: "인증 API 스펙을 찾았습니다:
[Preview 내용]
전체 내용이 필요하면 말씀해주세요."
```

### 시나리오 2: 전체 내용 로드

```
User: "전체 내용 보여줘"

Claude: [HTTP GET /api/context/BE/auth-api.md]
→ 전체 마크다운 반환
→ 분석 및 요약
```

### 시나리오 3: AI가 문서 업데이트

```
User: "새로운 /refresh-token 엔드포인트 추가해줘"

Claude: [write_context tool 호출]
→ PUT /api/context/BE/auth-api.md
→ 업데이트된 내용 반환

Claude: "API 스펙을 업데이트했습니다."
```

---

## Claude Desktop 설정

```json
{
  "mcpServers": {
    "agent-context-hub": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer eyJhbGc..."
      }
    }
  }
}
```

---

## 환경변수

```.env
# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key-32-chars-minimum-length-required
JWT_ISSUER=agent-context-hub
JWT_AUDIENCE=team-collaboration

# Storage
AGENT_INIT_DIR=./.agent-init
CACHE_TTL=300000  # 5분 (밀리초)

# Limits
MAX_FILE_SIZE=1048576     # 1MB
MAX_PREVIEW_LENGTH=500    # 500자
```

---

## 성공 지표

### Phase 1 완료 기준

1. ✅ valibot, jose 패키지 설치
2. ✅ JWT 인증 작동
3. ✅ .agent-init 디렉토리 스캔 가능
4. ✅ search_docs 툴이 Claude Desktop에서 작동
5. ✅ ResourceLink를 HTTP API로 해결 가능
6. ✅ 팀별 격리 확인

### Phase 2 완료 기준

1. ✅ list_teams, recent_updates 작동
2. ✅ write_context로 문서 수정 가능
3. ✅ 캐싱 성능 확인

### Phase 3 완료 기준 (추후)

1. ✅ README 문서 완성
2. ✅ 팀 데모 준비 완료

---

## 참고: MCP 조사 결과 핵심 요약

### SSE vs Streamable HTTP

- **SSE Transport**: Deprecated (2024-11-05)
- **Streamable HTTP**: 최신 표준, `@hono/mcp` 지원
- **차이점**: 단일 엔드포인트, 더 간단한 아키텍처

### Resources vs Tools

- **Resources**: 애플리케이션이 선택, 정적 데이터, 수동 활성화 필요
- **Tools**: AI가 자동 호출, 동적 검색, 더 나은 UX
- **프로덕션**: 대부분 Tools 사용 (context7, docs-mcp, library-mcp)

### ResourceLink 패턴

- 큰 파일을 효율적으로 처리
- Preview (작은 토큰) + 필요시 전체 로드
- LLM 컨텍스트 윈도우 절약
- 2025년 6월 MCP 스펙에 추가

### 토큰 효율성

- **MCP 오버헤드**: 4개 서버 → 14K 토큰 (툴 스키마만)
- **Prompt Caching**: 90% 비용 절감, 85% 레이턴시 감소
- **최소 캐시 크기**: 1024 토큰 (Sonnet), 5분 TTL
- **1MB 하드 리미트**: MCP 응답 크기 제한

---

## 향후 확장 (Phase 4+)

### 웹 에디터 UI

- React 기반 마크다운 에디터
- 파일 브라우저
- 실시간 미리보기
- 팀 협업 기능

### 고급 기능

- 문서 버전 관리 (Git 통합)
- 변경 알림 (MCP notifications)
- 전문 검색 (Elasticsearch)
- 태그/메타데이터 관리
- 문서 템플릿

### 배포 옵션

- Docker Compose (현재)
- Kubernetes
- Serverless (Cloudflare Workers)

---

**작성일**: 2025-11-01
**버전**: 1.0
