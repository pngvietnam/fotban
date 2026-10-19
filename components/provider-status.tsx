export function ProviderStatus({ name, configured, integrated = false }: { name: string; configured: boolean; integrated?: boolean }) {
  return <li className="flex flex-wrap justify-between gap-3 border-b border-slate-300 py-3 dark:border-slate-700">
    <span>{name}</span>
    <span className="text-sm text-slate-600 dark:text-slate-300">{configured ? (integrated ? "Đã cấu hình khóa · cần kiểm tra đồng bộ" : "Đã cấu hình khóa · chưa tích hợp") : "Chưa cấu hình"}</span>
  </li>;
}
