import {
  Activity,
  AppWindow,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleGauge,
  Clipboard,
  Code2,
  Database,
  FileClock,
  KeyRound,
  Layers3,
  LogOut,
  Plus,
  Radio,
  RefreshCcw,
  Rocket,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  X,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiClient } from "./api";
import type {
  AppSummary,
  Environment,
  Summary,
  Workspace,
} from "./types";

const environmentLabels: Record<Environment, string> = {
  production: "生产",
  staging: "预发",
  development: "开发",
};

const platformOptions = [
  ["macos", "macOS"],
  ["windows", "Windows"],
  ["linux", "Linux"],
  ["ios", "iOS"],
  ["android", "Android"],
] as const;

const defaultConfig = `{
  "apiEndpoint": "https://api.example.com",
  "featureFlags": {
    "newExperience": false
  },
  "retry": {
    "maxAttempts": 3
  }
}`;

const adminApi = new ApiClient();

export function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<Environment>("production");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [showVersionEditor, setShowVersionEditor] = useState(false);
  const [revealedToken, setRevealedToken] = useState("");
  const workspaceRequestId = useRef(0);
  const viewGeneration = useRef(0);

  const api = adminApi;
  const activeWorkspace =
    workspace?.app.id === selectedAppId &&
    workspace.environment === environment
      ? workspace
      : null;

  function selectApp(appId: string) {
    if (appId === selectedAppId) return;
    viewGeneration.current += 1;
    workspaceRequestId.current += 1;
    setWorkspace(null);
    setSelectedAppId(appId);
  }

  function selectEnvironment(nextEnvironment: Environment) {
    if (nextEnvironment === environment) return;
    viewGeneration.current += 1;
    workspaceRequestId.current += 1;
    setWorkspace(null);
    setEnvironment(nextEnvironment);
  }

  const loadWorkspace = useCallback(
    async (appId: string, targetEnvironment: Environment) => {
      const requestId = ++workspaceRequestId.current;
      setLoading(true);
      setError("");
      setWorkspace((current) =>
        current?.app.id === appId &&
        current.environment === targetEnvironment
          ? current
          : null,
      );
      try {
        const data = await api.workspace(appId, targetEnvironment);
        if (requestId !== workspaceRequestId.current) return;
        setWorkspace(data);
      } catch (caught) {
        if (requestId !== workspaceRequestId.current) return;
        setError(errorMessage(caught));
      } finally {
        if (requestId === workspaceRequestId.current) {
          setLoading(false);
        }
      }
    },
    [api],
  );

  const loadOverview = useCallback(async (preferredAppId?: string) => {
    const generation = viewGeneration.current;
    setLoading(true);
    setError("");
    try {
      const [nextSummary, appResponse] = await Promise.all([
        api.summary(),
        api.apps(),
      ]);
      setSummary(nextSummary);
      setApps(appResponse.apps);
      if (generation !== viewGeneration.current) return;
      const selectedAppStillExists = appResponse.apps.some(
        (item) => item.id === selectedAppId,
      );
      const nextAppId =
        preferredAppId ??
        (selectedAppStillExists ? selectedAppId : null) ??
        appResponse.apps.at(0)?.id ??
        null;
      setSelectedAppId(nextAppId);
      if (nextAppId) await loadWorkspace(nextAppId, environment);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, environment, loadWorkspace, selectedAppId]);

  useEffect(() => {
    void loadOverview();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedAppId) {
      void loadWorkspace(selectedAppId, environment);
    }
  }, [environment, selectedAppId]); // eslint-disable-line react-hooks/exhaustive-deps

  function signOut() {
    if (api.hasStoredAdminToken()) {
      api.clearStoredAdminToken();
      window.location.reload();
      return;
    }
    window.location.assign("/cdn-cgi/access/logout");
  }

  function showSuccess(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>灰雀</strong>
            <small>GRAYFINCH</small>
          </div>
        </div>

        <div className="mobile-controls">
          <select
            aria-label="切换应用"
            value={selectedAppId ?? ""}
            onChange={(event) => selectApp(event.target.value)}
          >
            {apps.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className="icon-button inverse"
            type="button"
            aria-label="创建应用"
            onClick={() => setShowCreateApp(true)}
          >
            <Plus size={18} />
          </button>
          <button
            className="icon-button inverse"
            type="button"
            aria-label="退出管理台"
            onClick={signOut}
          >
            <LogOut size={18} />
          </button>
        </div>

        <nav aria-label="主导航">
          <a className="nav-item active" href="#workspace">
            <CircleGauge size={19} />
            发布台
          </a>
          <a className="nav-item" href="#audit">
            <FileClock size={19} />
            变更记录
          </a>
          <a className="nav-item" href="#client-api">
            <TerminalSquare size={19} />
            接入接口
          </a>
        </nav>

        <div className="sidebar-apps">
          <div className="sidebar-heading">
            <span>应用</span>
            <button
              className="icon-button inverse"
              type="button"
              aria-label="创建应用"
              onClick={() => setShowCreateApp(true)}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="app-list">
            {apps.map((item) => (
              <button
                key={item.id}
                className={`app-list-item ${
                  item.id === selectedAppId ? "selected" : ""
                }`}
                type="button"
                onClick={() => selectApp(item.id)}
              >
                <span className="app-glyph">{item.name.slice(0, 1)}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.app_key}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>

        <button className="sign-out" type="button" onClick={signOut}>
          <LogOut size={18} />
          退出管理台
        </button>
      </aside>

      <main id="main-content" className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">GRAYFINCH / EDGE CONFIGURATION</p>
            <h1>{activeWorkspace?.app.name ?? "配置发布台"}</h1>
          </div>
          <div className="topbar-actions">
            <span className="edge-status">
              <span className="status-dot" />
              {summary?.userEmail ?? "ACCESS VERIFIED"}
            </span>
            <button
              className="button secondary"
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
            >
              <RefreshCcw size={17} className={loading ? "spinning" : ""} />
              刷新
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => setShowVersionEditor(true)}
              disabled={!activeWorkspace}
            >
              <Plus size={18} />
              新建版本
            </button>
          </div>
        </header>

        {error && (
          <div className="banner error-banner" role="alert">
            <ShieldCheck size={18} />
            <span>{error}</span>
            <button
              type="button"
              aria-label="关闭错误"
              onClick={() => setError("")}
            >
              <X size={17} />
            </button>
          </div>
        )}

        {notice && (
          <div className="toast" role="status">
            <Check size={18} />
            {notice}
          </div>
        )}

        {revealedToken && (
          <TokenNotice
            token={revealedToken}
            onClose={() => setRevealedToken("")}
          />
        )}

        {apps.length === 0 && !loading ? (
          <EmptyState onCreate={() => setShowCreateApp(true)} />
        ) : (
          <>
            <section className="metrics-strip" aria-label="概览">
              <Metric
                label="应用"
                value={summary?.apps ?? 0}
                icon={<AppWindow size={18} />}
              />
              <Metric
                label="配置版本"
                value={summary?.versions ?? 0}
                icon={<Layers3 size={18} />}
              />
              <Metric
                label="已发布环境"
                value={summary?.releases ?? 0}
                icon={<Radio size={18} />}
              />
              <Metric
                label="正在灰度"
                value={summary?.canaries ?? 0}
                icon={<Activity size={18} />}
                accent
              />
            </section>

            <section id="workspace" className="workspace">
              <div className="workspace-main">
                <div className="environment-row">
                  <div
                    className="environment-switcher"
                    role="tablist"
                    aria-label="配置环境"
                  >
                    {(
                      ["production", "staging", "development"] as Environment[]
                    ).map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="tab"
                        aria-selected={environment === item}
                        className={environment === item ? "active" : ""}
                        onClick={() => selectEnvironment(item)}
                      >
                        {environmentLabels[item]}
                      </button>
                    ))}
                  </div>
                  <div className="endpoint-chip">
                    <Code2 size={16} />
                    /api/v1/config/{activeWorkspace?.app.app_key}
                    <CopyButton
                      value={`${window.location.origin}/api/v1/config/${activeWorkspace?.app.app_key}`}
                    />
                  </div>
                </div>

                <div className="section-heading">
                  <div>
                    <p className="section-index">02 / 版本轨迹</p>
                    <h2>不可变配置版本</h2>
                  </div>
                  <span>{activeWorkspace?.versions.length ?? 0} 个版本</span>
                </div>

                <VersionRail workspace={activeWorkspace} />

                <section id="audit" className="audit-section">
                  <div className="section-heading compact">
                    <div>
                      <p className="section-index">03 / 审计</p>
                      <h2>最近变更</h2>
                    </div>
                  </div>
                  <div className="audit-list">
                    {activeWorkspace?.audits.length ? (
                      activeWorkspace.audits.map((audit) => (
                        <div className="audit-row" key={audit.id}>
                          <span className="audit-mark" />
                          <strong>{auditLabel(audit.action)}</strong>
                          <code>{JSON.stringify(audit.detail)}</code>
                          <time>{formatTime(audit.created_at)}</time>
                        </div>
                      ))
                    ) : (
                      <p className="muted">当前应用还没有变更记录。</p>
                    )}
                  </div>
                </section>
              </div>

              <aside className="release-panel">
                <ReleaseEditor
                  workspace={activeWorkspace}
                  environment={environment}
                  api={api}
                  onSaved={async () => {
                    if (!selectedAppId) return;
                    await Promise.all([
                      loadWorkspace(selectedAppId, environment),
                      loadOverview(),
                    ]);
                    showSuccess("灰度规则已发布。");
                  }}
                  onError={setError}
                />
                <ClientAccess
                  workspace={activeWorkspace}
                  api={api}
                  onToken={setRevealedToken}
                  onError={setError}
                />
              </aside>
            </section>
          </>
        )}
      </main>

      {showCreateApp && (
        <CreateAppPanel
          api={api}
          onClose={() => setShowCreateApp(false)}
          onCreated={async (appId, clientToken) => {
            setShowCreateApp(false);
            setRevealedToken(clientToken);
            await loadOverview(appId);
            showSuccess("应用已创建。");
          }}
          onError={setError}
        />
      )}

      {showVersionEditor && activeWorkspace && (
        <VersionEditor
          api={api}
          workspace={activeWorkspace}
          environment={environment}
          onClose={() => setShowVersionEditor(false)}
          onCreated={async () => {
            setShowVersionEditor(false);
            await loadWorkspace(activeWorkspace.app.id, environment);
            await loadOverview();
            showSuccess("新配置版本已保存。");
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <span className="metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{String(value).padStart(2, "0")}</strong>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state">
      <div className="empty-graphic" aria-hidden="true">
        <span>CONFIG</span>
        <i />
        <i />
        <i />
      </div>
      <div>
        <p className="section-index">从一个应用开始</p>
        <h2>还没有可以发布的配置。</h2>
        <p>创建应用后，你可以建立不可变版本，并按客户端稳定分桶灰度。</p>
        <button className="button primary" type="button" onClick={onCreate}>
          <Plus size={18} />
          创建第一个应用
        </button>
      </div>
    </section>
  );
}

function VersionRail({ workspace }: { workspace: Workspace | null }) {
  if (!workspace?.versions.length) {
    return (
      <div className="version-empty">
        <Database size={24} />
        <div>
          <strong>这个环境还没有配置版本</strong>
          <p>创建第一个版本后，它会自动成为稳定版本。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="version-rail">
      {workspace.versions.map((version) => {
        const isStable = workspace.release?.stable_version_id === version.id;
        const isCanary = workspace.release?.canary_version_id === version.id;
        return (
          <article className="version-row" key={version.id}>
            <div className="version-node">
              <span>{version.version}</span>
            </div>
            <div className="version-body">
              <div className="version-title">
                <div>
                  <h3>v{version.version}</h3>
                  <strong>{version.label}</strong>
                </div>
                <div className="badges">
                  {isStable && <span className="badge stable">稳定</span>}
                  {isCanary && <span className="badge canary">灰度</span>}
                </div>
              </div>
              <pre>{JSON.stringify(version.config, null, 2)}</pre>
              <time>{formatTime(version.created_at)}</time>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReleaseEditor({
  workspace,
  environment,
  api,
  onSaved,
  onError,
}: {
  workspace: Workspace | null;
  environment: Environment;
  api: ApiClient;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [stableId, setStableId] = useState("");
  const [canaryId, setCanaryId] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [allowlist, setAllowlist] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [minVersion, setMinVersion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStableId(
      workspace?.release?.stable_version_id ??
        workspace?.versions.at(-1)?.id ??
        "",
    );
    setCanaryId(workspace?.release?.canary_version_id ?? "");
    setPercentage(workspace?.release?.rollout_percentage ?? 0);
    setAllowlist(workspace?.release?.clientAllowlist.join("\n") ?? "");
    setPlatforms(workspace?.release?.platforms ?? []);
    setMinVersion(workspace?.release?.min_app_version ?? "");
  }, [workspace]);

  async function saveRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !stableId) return;
    setSaving(true);
    try {
      await api.updateRelease(workspace.app.id, environment, {
        stableVersionId: stableId,
        canaryVersionId: canaryId || null,
        rolloutPercentage: canaryId ? percentage : 0,
        clientAllowlist: allowlist
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        platforms,
        minAppVersion: minVersion.trim() || null,
      });
      await onSaved();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function togglePlatform(platform: string) {
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  return (
    <form className="release-editor" onSubmit={saveRelease}>
      <div className="release-kicker">
        <SlidersHorizontal size={18} />
        <span>{environmentLabels[environment]}环境</span>
      </div>
      <h2>灰度控制</h2>
      <p>指定新版本进入哪些客户端。扩大比例时，已有分桶保持不变。</p>

      <label htmlFor="stable-version">稳定版本</label>
      <select
        id="stable-version"
        value={stableId}
        onChange={(event) => setStableId(event.target.value)}
        disabled={!workspace?.versions.length}
      >
        <option value="">尚无版本</option>
        {workspace?.versions.map((version) => (
          <option key={version.id} value={version.id}>
            v{version.version} · {version.label}
          </option>
        ))}
      </select>

      <label htmlFor="canary-version">灰度版本</label>
      <select
        id="canary-version"
        value={canaryId}
        onChange={(event) => setCanaryId(event.target.value)}
        disabled={!workspace?.versions.length}
      >
        <option value="">不启用灰度</option>
        {workspace?.versions
          .filter((version) => version.id !== stableId)
          .map((version) => (
            <option key={version.id} value={version.id}>
              v{version.version} · {version.label}
            </option>
          ))}
      </select>

      <div className={`rollout-controls ${canaryId ? "" : "disabled"}`}>
        <div className="range-heading">
          <label htmlFor="rollout-range">随机分桶比例</label>
          <output htmlFor="rollout-range">{percentage}%</output>
        </div>
        <input
          id="rollout-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={percentage}
          onChange={(event) => setPercentage(Number(event.target.value))}
          disabled={!canaryId}
        />
        <div className="range-scale">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>

        <fieldset>
          <legend>平台范围</legend>
          <div className="platform-grid">
            {platformOptions.map(([value, label]) => (
              <label key={value} className="check-control">
                <input
                  type="checkbox"
                  checked={platforms.includes(value)}
                  onChange={() => togglePlatform(value)}
                  disabled={!canaryId}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="min-version">最低客户端版本</label>
        <input
          id="min-version"
          type="text"
          value={minVersion}
          onChange={(event) => setMinVersion(event.target.value)}
          placeholder="例如 2.3.0"
          disabled={!canaryId}
        />

        <label htmlFor="allowlist">固定灰度名单</label>
        <textarea
          id="allowlist"
          value={allowlist}
          onChange={(event) => setAllowlist(event.target.value)}
          placeholder={"每行一个 client_id\nqa-mac-01"}
          rows={4}
          disabled={!canaryId}
        />
      </div>

      <button
        className="button ink wide"
        type="submit"
        disabled={saving || !stableId}
      >
        {saving ? <RefreshCcw className="spinning" size={18} /> : <Rocket size={18} />}
        {saving ? "发布规则..." : "发布灰度规则"}
      </button>
    </form>
  );
}

function ClientAccess({
  workspace,
  api,
  onToken,
  onError,
}: {
  workspace: Workspace | null;
  api: ApiClient;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}) {
  const [rotating, setRotating] = useState(false);

  async function rotate() {
    if (!workspace) return;
    setRotating(true);
    try {
      const response = await api.rotateToken(workspace.app.id);
      onToken(response.clientToken);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setRotating(false);
    }
  }

  return (
    <section id="client-api" className="client-access">
      <div>
        <KeyRound size={18} />
        <strong>客户端访问</strong>
      </div>
      <p>令牌只在创建或轮换时展示一次。</p>
      <button
        type="button"
        className="text-button"
        onClick={() => void rotate()}
        disabled={!workspace || rotating}
      >
        {rotating ? "正在轮换..." : "轮换客户端令牌"}
        <ArrowUpRight size={15} />
      </button>
    </section>
  );
}

function CreateAppPanel({
  api,
  onClose,
  onCreated,
  onError,
}: {
  api: ApiClient;
  onClose: () => void;
  onCreated: (id: string, token: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.createApp({ name, key, description });
      await onCreated(response.app.id, response.clientToken);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="editor-drawer"
        aria-labelledby="create-app-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <p className="section-index">新资源</p>
            <h2 id="create-app-title">创建应用</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭创建应用"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="app-name">应用名称</label>
          <input
            id="app-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如 桌面端套件"
            required
          />
          <label htmlFor="app-key">应用标识</label>
          <input
            id="app-key"
            value={key}
            onChange={(event) =>
              setKey(
                event.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "-"),
              )
            }
            placeholder="desktop-suite"
            pattern="[a-z0-9-]+"
            required
          />
          <span className="field-hint">客户端请求路径将使用这个标识。</span>
          <label htmlFor="app-description">用途</label>
          <textarea
            id="app-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="这组配置服务于哪些客户端？"
            rows={4}
          />
          <button className="button primary wide" type="submit" disabled={saving}>
            {saving ? <RefreshCcw className="spinning" size={18} /> : <Plus size={18} />}
            {saving ? "正在创建..." : "创建应用"}
          </button>
        </form>
      </aside>
    </div>
  );
}

function VersionEditor({
  api,
  workspace,
  environment,
  onClose,
  onCreated,
  onError,
}: {
  api: ApiClient;
  workspace: Workspace;
  environment: Environment;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [configText, setConfigText] = useState(() =>
    workspace.versions.at(0)
      ? JSON.stringify(workspace.versions[0].config, null, 2)
      : defaultConfig,
  );
  const [jsonError, setJsonError] = useState("");
  const [saving, setSaving] = useState(false);

  function formatJson() {
    try {
      setConfigText(JSON.stringify(JSON.parse(configText), null, 2));
      setJsonError("");
    } catch {
      setJsonError("JSON 格式不正确，请检查逗号、引号和括号。");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let config: Record<string, unknown>;
    try {
      const parsed = JSON.parse(configText);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error();
      }
      config = parsed;
      setJsonError("");
    } catch {
      setJsonError("配置必须是一个有效的 JSON 对象。");
      return;
    }

    setSaving(true);
    try {
      await api.createVersion(workspace.app.id, {
        environment,
        label,
        config,
      });
      await onCreated();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="editor-drawer wide-drawer"
        aria-labelledby="version-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <p className="section-index">
              {environmentLabels[environment]}环境
            </p>
            <h2 id="version-title">创建不可变版本</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭版本编辑器"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="version-label">版本说明</label>
          <input
            id="version-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="例如 启用新版导航"
            required
          />
          <div className="editor-label-row">
            <label htmlFor="config-json">配置 JSON</label>
            <button className="text-button" type="button" onClick={formatJson}>
              <Code2 size={15} />
              格式化
            </button>
          </div>
          <textarea
            id="config-json"
            className="code-editor"
            value={configText}
            onChange={(event) => setConfigText(event.target.value)}
            aria-describedby={jsonError ? "json-error" : undefined}
            rows={20}
            spellCheck={false}
          />
          {jsonError && (
            <span id="json-error" className="field-error">
              {jsonError}
            </span>
          )}
          <button className="button primary wide" type="submit" disabled={saving}>
            {saving ? <RefreshCcw className="spinning" size={18} /> : <Save size={18} />}
            {saving ? "正在保存版本..." : "保存新版本"}
          </button>
        </form>
      </aside>
    </div>
  );
}

function TokenNotice({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  return (
    <section className="token-notice" aria-labelledby="token-title">
      <div>
        <ShieldCheck size={20} />
        <div>
          <strong id="token-title">请立即保存客户端令牌</strong>
          <p>关闭后无法再次查看，只能轮换。</p>
        </div>
      </div>
      <code>{token}</code>
      <CopyButton value={token} label="复制令牌" />
      <button
        className="icon-button"
        type="button"
        aria-label="关闭令牌提示"
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </section>
  );
}

function CopyButton({
  value,
  label = "复制",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      className="copy-button"
      type="button"
      onClick={() => void copy()}
      aria-label={label}
    >
      {copied ? <Check size={15} /> : <Clipboard size={15} />}
      {label !== "复制" && <span>{copied ? "已复制" : label}</span>}
    </button>
  );
}

function formatTime(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    "app.created": "创建应用",
    "version.created": "创建配置版本",
    "release.updated": "更新灰度规则",
    "token.rotated": "轮换客户端令牌",
  };
  return labels[action] ?? action;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求没有完成，请稍后重试。";
}
