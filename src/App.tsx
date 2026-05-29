import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { useAppStore } from "./stores/appStore";
import { useGitHubReleases } from "./hooks/useGitHubReleases";
import { applyWindowTheme } from "./utils/windowTheme";
import { CertificateView } from "./views/CertificateView";
import { RulesView } from "./views/RulesView";
import { SettingsView } from "./views/SettingsView";
import { SslView } from "./views/SslView";
import { TrafficView } from "./views/TrafficView";

function RulesViewWithPresets() {
  return <RulesView />;
}

export default function App() {
  const page = useAppStore((s) => s.page);
  const init = useAppStore((s) => s.init);
  const { checkLatestRelease } = useGitHubReleases();

  useEffect(() => {
    void applyWindowTheme();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    init().then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [init]);

  useEffect(() => {
    checkLatestRelease(true);
  }, [checkLatestRelease]);

  return (
    <Layout>
      <div className="flex min-h-0 flex-1 flex-col">
        {page === "traffic" && <TrafficView />}
        {page === "rules" && <RulesViewWithPresets />}
        {page === "ssl" && <SslView />}
        {page === "certificate" && <CertificateView />}
        {page === "settings" && <SettingsView />}
      </div>
    </Layout>
  );
}
