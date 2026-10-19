import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
export default function NotFound() { return <NewsShell><h1 className="sr-only">Không tìm thấy tin</h1><NewsState kind="missing" /></NewsShell>; }
