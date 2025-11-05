# Agent Context Hub - Workspace Symlink 권한 구조 설계

## 개요

워크스페이스 기반 symlink를 활용한 명시적 권한 관리 시스템

### 핵심 원칙
1. **명시적 권한**: symlink 존재 = 접근 권한
2. **워크스페이스 격리**: 각 워크스페이스는 독립적인 문서 뷰
3. **단일 소스**: storage/ 디렉토리만 실제 파일 보관
4. **Admin 중심**: Admin UI로 symlink 관리

---

## 디렉토리 구조

```
.agent-init/
├── storage/                           # 실제 파일 저장소
│   ├── PM/
│   │   ├── product-roadmap.md
│   │   └── feature-specs.md
│   ├── BE/
│   │   ├── api-spec.md
│   │   └── database-schema.md
│   ├── FE/
│   │   └── component-guide.md
│   └── DESIGN/
│       └── design-system.md
│
└── workspaces/                        # 워크스페이스별 뷰
    ├── project-alpha/
    │   ├── roadmap.md -> ../../storage/PM/product-roadmap.md
    │   ├── api.md -> ../../storage/BE/api-spec.md
    │   └── components.md -> ../../storage/FE/component-guide.md
    │
    └── project-beta/
        ├── features.md -> ../../storage/PM/feature-specs.md
        └── db-schema.md -> ../../storage/BE/database-schema.md
```

---

## JWT 페이로드 구조

```typescript
{
  sub: "user-alice",
  workspace_id: "project-alpha",      // 기본 워크스페이스
  workspaces: [                       // 접근 가능한 모든 워크스페이스
    "project-alpha",
    "project-beta"
  ],
  permissions: [
    "read:workspace:project-alpha",
    "write:workspace:project-alpha",
    "read:workspace:project-beta",
    "admin:workspaces"                // Admin UI 접근
  ],
  exp: 1734567890
}
```

---

## 권한 모델

### 3단계 체크

1. **워크스페이스 접근 권한**
   ```typescript
   jwtPayload.workspaces.includes(workspaceId)
   ```

2. **파일 존재 확인** (Symlink)
   ```typescript
   fs.existsSync(`workspaces/${workspaceId}/${path}`)
   ```

3. **작업별 권한**
   - Read: `read:workspace:{workspaceId}`
   - Write: `write:workspace:{workspaceId}`
   - Admin: `admin:workspaces`

---

## API 구조

### MCP Tools (Claude용)

#### search_docs
```typescript
// Input
{
  query: string
  workspace?: string  // 없으면 jwtPayload.workspace_id 사용
}

// Output
{
  results: [{
    title: "API Spec",
    preview: "# API Specification...",
    workspace: "project-alpha",
    path: "api.md",
    metadata: {
      sourceTeam: "BE",
      sourceFile: "api-spec.md",
      size: 15360,
      lastModified: "2025-11-05T10:30:00Z"
    },
    resourceLink: {
      uri: "context://project-alpha/api.md"
    }
  }]
}
```

#### list_workspaces
```typescript
// 새로운 툴 - 접근 가능한 워크스페이스 목록
{
  workspaces: [
    {
      id: "project-alpha",
      name: "Project Alpha",
      documentCount: 3,
      lastModified: "2025-11-05T10:30:00Z",
      permissions: ["read", "write"]
    }
  ]
}
```

### HTTP API (ResourceLink 해결)

#### GET /api/context/:workspace/:path
```typescript
// Before: /api/context/:team/:file
// After:  /api/context/:workspace/:path

// Example: GET /api/context/project-alpha/api.md
// → Resolves symlink: workspaces/project-alpha/api.md
// → Reads actual file: storage/BE/api-spec.md
```

### Admin API (워크스페이스 관리)

#### POST /admin/workspaces
```typescript
// 워크스페이스 생성
{
  id: "project-gamma",
  name: "Project Gamma",
  description: "New product initiative"
}
```

#### POST /admin/workspaces/:workspace/links
```typescript
// Symlink 추가 (문서를 워크스페이스에 연결)
{
  sourceTeam: "BE",
  sourceFile: "api-spec.md",
  targetPath: "backend-api.md",  // 워크스페이스 내 경로 (alias)
  readOnly: false
}

// → Creates: workspaces/project-gamma/backend-api.md
//            -> ../../storage/BE/api-spec.md
```

#### DELETE /admin/workspaces/:workspace/links/:path
```typescript
// Symlink 삭제 (권한 회수)
// DELETE /admin/workspaces/project-gamma/links/backend-api.md
// → Removes symlink only (원본 파일은 유지)
```

#### GET /admin/workspaces/:workspace/links
```typescript
// 워크스페이스의 모든 symlink 조회
{
  links: [
    {
      path: "api.md",
      source: "storage/BE/api-spec.md",
      isValid: true,
      size: 15360,
      lastModified: "2025-11-05T10:30:00Z"
    },
    {
      path: "broken-link.md",
      source: "storage/PM/deleted.md",
      isValid: false,  // 원본 파일 삭제됨
      error: "ENOENT"
    }
  ]
}
```

#### GET /admin/storage/:team
```typescript
// storage 내 모든 파일 조회 (symlink 소스 목록)
{
  team: "BE",
  files: [
    {
      file: "api-spec.md",
      size: 15360,
      linkedBy: [  // 이 파일을 참조하는 워크스페이스들
        { workspace: "project-alpha", path: "api.md" },
        { workspace: "project-beta", path: "backend.md" }
      ]
    }
  ]
}
```

---

## FilesystemStorage 리팩토링

### 새로운 메서드 구조

```typescript
class FilesystemStorage {
  private storageDir: string    // .agent-init/storage
  private workspaceDir: string  // .agent-init/workspaces

  // === Storage 직접 접근 (Admin만) ===
  async readFromStorage(team: string, file: string): Promise<Document>
  async writeToStorage(team: string, file: string, content: string): Promise<void>
  async listStorageFiles(team: string): Promise<StorageFile[]>

  // === Workspace 접근 (일반 사용자) ===
  async readDocument(workspace: string, path: string): Promise<Document>
  async listWorkspaceDocuments(workspace: string): Promise<Document[]>
  async searchDocuments(workspace: string, query: string): Promise<Document[]>

  // === Workspace 관리 (Admin) ===
  async createWorkspace(workspaceId: string): Promise<void>
  async deleteWorkspace(workspaceId: string): Promise<void>
  async listWorkspaces(): Promise<string[]>

  // === Symlink 관리 (Admin) ===
  async createSymlink(
    workspace: string,
    sourceTeam: string,
    sourceFile: string,
    targetPath: string
  ): Promise<void>

  async removeSymlink(workspace: string, targetPath: string): Promise<void>

  async listSymlinks(workspace: string): Promise<SymlinkInfo[]>

  async validateSymlinks(workspace: string): Promise<BrokenLink[]>

  // === 유틸리티 ===
  async resolveSymlink(workspace: string, path: string): Promise<{
    team: string
    file: string
    realPath: string
  }>
}
```

### SymlinkInfo 타입

```typescript
interface SymlinkInfo {
  path: string              // 워크스페이스 내 경로
  source: string            // 실제 파일 경로 (상대)
  sourceTeam: string
  sourceFile: string
  isValid: boolean          // symlink가 유효한지
  target?: string           // 실제 해석된 경로
  error?: string            // 에러 메시지 (broken link)
}

interface StorageFile {
  team: string
  file: string
  size: number
  lastModified: Date
  linkedBy: Array<{         // 역참조
    workspace: string
    path: string
  }>
}
```

---

## PermissionManager

```typescript
// src/auth/permission-manager.ts
class PermissionManager {
  constructor(private storage: FilesystemStorage) {}

  // 워크스페이스 접근 가능 여부
  canAccessWorkspace(jwtPayload: JWTPayload, workspaceId: string): boolean {
    return jwtPayload.workspaces.includes(workspaceId)
  }

  // 문서 읽기 가능 여부
  async canReadDocument(
    jwtPayload: JWTPayload,
    workspace: string,
    path: string
  ): Promise<boolean> {
    if (!this.canAccessWorkspace(jwtPayload, workspace)) return false
    if (!jwtPayload.permissions.includes(`read:workspace:${workspace}`)) return false

    // Symlink 존재 여부 확인
    const symlinkPath = `workspaces/${workspace}/${path}`
    return fs.existsSync(symlinkPath)
  }

  // 문서 쓰기 가능 여부
  async canWriteDocument(
    jwtPayload: JWTPayload,
    workspace: string,
    path: string
  ): Promise<boolean> {
    if (!(await this.canReadDocument(jwtPayload, workspace, path))) return false
    return jwtPayload.permissions.includes(`write:workspace:${workspace}`)
  }

  // Admin 권한 여부
  isAdmin(jwtPayload: JWTPayload): boolean {
    return jwtPayload.permissions.includes('admin:workspaces')
  }

  // 접근 가능한 모든 문서 조회
  async getAccessibleDocuments(
    jwtPayload: JWTPayload,
    workspaceId?: string
  ): Promise<Document[]> {
    const workspaces = workspaceId
      ? [workspaceId]
      : jwtPayload.workspaces

    const allDocs = await Promise.all(
      workspaces.map(ws => this.storage.listWorkspaceDocuments(ws))
    )

    return allDocs.flat()
  }
}
```

---

## Admin UI 요구사항

### 페이지 구성

1. **워크스페이스 관리**
   - 워크스페이스 목록
   - 생성/삭제
   - 메타데이터 편집

2. **문서 연결 관리**
   - Storage 파일 브라우저 (소스)
   - Workspace 파일 리스트 (타겟)
   - Drag & Drop으로 Symlink 생성
   - Alias 입력 (파일명 변경)

3. **권한 모니터링**
   - 각 워크스페이스별 문서 목록
   - Broken symlink 감지 및 수정
   - 역참조 뷰 (파일이 어느 워크스페이스에 연결되었는지)

4. **감사 로그**
   - Symlink 생성/삭제 이력
   - 접근 로그 (추후)

### UI 프레임워크

- **React** + **Vite** + **TypeScript**
- **TanStack Table** - 파일 리스트
- **React DnD** - Drag & Drop
- **Tailwind CSS** - 스타일링
- **React Query** - API 상태 관리

---

## 마이그레이션 계획

### Phase 1: 구조 변경 (즉시)
```bash
# 기존 .agent-init/ 구조
.agent-init/
├── PM/
├── BE/
└── FE/

# 새로운 구조로 이동
.agent-init/
├── storage/
│   ├── PM/ (기존 파일 이동)
│   ├── BE/
│   └── FE/
└── workspaces/
    └── default/  (모든 파일 symlink로 생성)
```

### Phase 2: 코드 업데이트
1. ✅ FilesystemStorage 리팩토링
2. ✅ PermissionManager 구현
3. ✅ Admin API 구현
4. ✅ MCP Tools 업데이트
5. ✅ JWT 스키마 업데이트

### Phase 3: Admin UI
1. ✅ React 프로젝트 생성
2. ✅ 워크스페이스 CRUD
3. ✅ Symlink 관리 UI
4. ✅ 모니터링 대시보드

---

## 보안 고려사항

### 1. Path Traversal 방지
```typescript
// Symlink 생성 시 validation
if (targetPath.includes('..') || targetPath.startsWith('/')) {
  throw new Error('Invalid target path')
}

// Workspace ID validation
if (!/^[a-zA-Z0-9-_]+$/.test(workspaceId)) {
  throw new Error('Invalid workspace ID')
}
```

### 2. Symlink Loop 방지
```typescript
// Symlink는 항상 storage -> workspaces 방향만 허용
// workspaces 내부에서 다른 workspace로의 symlink 금지
async createSymlink(workspace, sourceTeam, sourceFile, targetPath) {
  const source = path.resolve(this.storageDir, sourceTeam, sourceFile)
  const target = path.resolve(this.workspaceDir, workspace, targetPath)

  // Source must be in storage/
  if (!source.startsWith(this.storageDir)) {
    throw new Error('Invalid source path')
  }

  // Target must be in workspaces/
  if (!target.startsWith(this.workspaceDir)) {
    throw new Error('Invalid target path')
  }

  await fs.symlink(
    path.relative(path.dirname(target), source),
    target
  )
}
```

### 3. Admin 권한 엄격히 체크
```typescript
// Admin API는 모두 admin:workspaces 권한 필요
app.post('/admin/*', jwtAuth(), requirePermission('admin:workspaces'))
```

---

## 성능 최적화

### 1. Symlink 캐싱
```typescript
// Symlink 해석 결과 캐싱 (5분)
private symlinkCache: Map<string, { team: string, file: string, timestamp: number }>

async resolveSymlink(workspace: string, path: string) {
  const cacheKey = `${workspace}/${path}`
  const cached = this.symlinkCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < 300000) {
    return cached
  }

  // 실제 해석
  const resolved = await fs.readlink(`workspaces/${workspace}/${path}`)
  const result = this.parseSymlinkPath(resolved)

  this.symlinkCache.set(cacheKey, { ...result, timestamp: Date.now() })
  return result
}
```

### 2. Broken Link 주기적 체크
```typescript
// Cron job: 1시간마다 실행
async checkBrokenLinks() {
  const workspaces = await this.listWorkspaces()

  for (const ws of workspaces) {
    const broken = await this.validateSymlinks(ws)
    if (broken.length > 0) {
      logger.warn(`Broken links in ${ws}:`, broken)
      // 알림 전송 또는 자동 삭제
    }
  }
}
```

---

## 예시 시나리오

### 시나리오 1: 새 워크스페이스 생성

```typescript
// 1. Admin이 워크스페이스 생성
POST /admin/workspaces
{
  id: "project-gamma",
  name: "Project Gamma"
}

// 2. BE 팀 API 문서 추가
POST /admin/workspaces/project-gamma/links
{
  sourceTeam: "BE",
  sourceFile: "api-spec.md",
  targetPath: "backend-api.md"
}

// 3. PM 팀 로드맵 추가
POST /admin/workspaces/project-gamma/links
{
  sourceTeam: "PM",
  sourceFile: "product-roadmap.md",
  targetPath: "roadmap.md"
}

// 결과:
workspaces/project-gamma/
  ├── backend-api.md -> ../../storage/BE/api-spec.md
  └── roadmap.md -> ../../storage/PM/product-roadmap.md
```

### 시나리오 2: Claude가 문서 검색

```typescript
// User: "project-gamma의 백엔드 API 스펙 찾아줘"

// Claude calls: search_docs
{
  query: "백엔드 API",
  workspace: "project-gamma"  // JWT에서 자동 추출 가능
}

// Server:
// 1. JWT에서 workspace 접근 권한 확인
// 2. workspaces/project-gamma/ 스캔
// 3. backend-api.md symlink 발견
// 4. storage/BE/api-spec.md 읽기
// 5. Preview + ResourceLink 반환
```

### 시나리오 3: 권한 회수

```typescript
// Admin이 project-beta에서 민감한 문서 제거
DELETE /admin/workspaces/project-beta/links/sensitive-data.md

// → Symlink만 삭제, 원본은 storage/에 유지
// → project-beta 멤버는 더 이상 접근 불가
// → 다른 워크스페이스(project-alpha)는 여전히 접근 가능
```

---

## 구현 우선순위

### Sprint 1: Core 리팩토링
1. ✅ 디렉토리 구조 변경 스크립트
2. ✅ FilesystemStorage 리팩토링
3. ✅ PermissionManager 구현
4. ✅ JWT 스키마 업데이트
5. ✅ 기존 MCP Tools 업데이트

### Sprint 2: Admin API
1. ✅ Workspace CRUD API
2. ✅ Symlink 관리 API
3. ✅ Storage 조회 API
4. ✅ 역참조 기능

### Sprint 3: Admin UI
1. ✅ React 프로젝트 setup
2. ✅ Workspace 관리 UI
3. ✅ Symlink DnD 인터페이스
4. ✅ Broken link 모니터링

### Sprint 4: 고급 기능
1. ⏳ 감사 로그
2. ⏳ Webhook 알림
3. ⏳ Workspace 템플릿
4. ⏳ 문서 버전 관리

---

**작성일**: 2025-11-05
**버전**: 2.0 (Workspace Symlink Architecture)
