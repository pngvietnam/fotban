import { notFound } from "next/navigation";
import { adminPageRuntime } from "../../../lib/admin-runtime";
import { adminSections, AdminError } from "../../../lib/admin-policy";
import { AdminShell } from "../../../components/admin/admin-shell";
import { AdminListView, AdminStoryDetail, AdminTransferDetail, AdminBriefPreview } from "../../../components/admin/admin-view";
import { AdminUnavailable } from "../../../components/admin/admin-unavailable";
import type { BriefView } from "../../../services/brief-query";
import type { AdminRow } from "../../../services/admin-query";
export default async function AdminSectionPage({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {section}=await params;if(!adminSections.includes(section as typeof adminSections[number])) notFound();
  const kind=section as typeof adminSections[number];const raw=await searchParams;
  let list;let detail:unknown;let id="";
  try {
    const runtime=await adminPageRuntime();await runtime.authorize();
    const {id:selected,...filters}=raw;
    if(selected!==undefined&&typeof selected!=="string") throw new AdminError("INVALID_INPUT");
    id=selected??"";
    if(id) detail=await runtime.queries.detail(kind,id);
    list=await runtime.queries.list(kind,filters);
  } catch(error) {return <AdminUnavailable invalid={error instanceof AdminError&&["INVALID_INPUT","NOT_FOUND"].includes(error.code)}/>;}
  return <AdminShell section={kind}>{id&&kind==="stories"&&detail!=null&&<AdminStoryDetail detail={detail as React.ComponentProps<typeof AdminStoryDetail>["detail"]}/>} {id&&kind==="transfers"&&detail!=null&&<AdminTransferDetail id={id} updates={(detail as {updates:AdminRow[]}).updates}/>} {id&&kind==="briefs"&&<AdminBriefPreview id={id} brief={(detail as {brief:BriefView|null})?.brief??null}/>}<AdminListView list={list}/></AdminShell>;
}
