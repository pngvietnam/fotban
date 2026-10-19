"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type AdminField={key:string;label:string;kind?:"text"|"textarea"|"boolean"|"number"|"select"|"array"|"multi";value?:unknown;nullable?:boolean;options?:{value:string;label:string}[];group?:string};
export function AdminForm({action,id,expectedUpdatedAt,fields=[],baseData,label,danger=false}:{action:string;id:string;expectedUpdatedAt?:string;fields?:AdminField[];baseData?:Record<string,unknown>;label:string;danger?:boolean}) {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const router=useRouter();
  return <form className="mt-4 space-y-4" onSubmit={async(event)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    if(danger && !window.confirm("Xác nhận thao tác đã được rà soát? Quyền và bằng chứng vẫn được kiểm tra tại máy chủ.")) return;
    const data:Record<string,unknown>={...baseData};
    for(const field of fields) {
      if(field.group && !form.has(`enable_${field.group}`)) continue;
      const raw=form.get(field.key);let value:unknown=field.kind==="boolean"?form.has(field.key):field.kind==="multi"?form.getAll(field.key):field.kind==="array"?String(raw??"").split(/[\n,]+/).map(v=>v.trim()).filter(Boolean):field.kind==="number"?Number(raw):String(raw??"").trim();
      if(field.nullable && value==="") value=null;
      const path=field.key.split(".");let target=data;for(const key of path.slice(0,-1)) {target[key]??={};target=target[key] as Record<string,unknown>;}target[path.at(-1)!]=value;
    }
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/admin/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id,...(expectedUpdatedAt?{expectedUpdatedAt}:{}),reason:String(form.get("reason")??""),confirm:form.has("confirm"),...(fields.length||baseData?{data}:{})})});
      const result=await response.json();if(!response.ok){setMessage(typeof result.error==="string"?result.error:"Không thể hoàn tất thao tác.");return;}
      const state:Record<string,string>={FAILED:"Tác vụ thất bại; xem nhật ký để xử lý.",PARTIAL:"Tác vụ hoàn tất một phần; xem nhật ký nguồn bị thiếu.",SKIPPED:"Tác vụ được bỏ qua an toàn; một quy trình có thể đang chạy.",DRAFT:"Đã tạo bản nháp; chưa đủ điều kiện xuất bản.",NEEDS_REVIEW:"Đã ghi nhận; cần rà soát thêm."};
      const audit=typeof result.auditId==="string"&&/^[a-f0-9-]{36}$/i.test(result.auditId)?` Mã nhật ký để đối chiếu/hoàn tác: ${result.auditId}.`:"";
      setMessage((state[result.status]??"Đã hoàn tất và ghi lịch sử. Thông tin đang được cập nhật.")+audit);router.refresh();
    } catch {setMessage("Chưa thể kết nối. Vui lòng tải lại và kiểm tra trạng thái trước khi thử lại.");} finally {setBusy(false);}
  }}>
    {fields.some(f=>f.group)&&<label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" name="enable_transfer" className="mt-1 h-4 w-4"/>Sửa ánh xạ chuyển nhượng bằng thực thể và đoạn nguồn đã có</label>}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">{fields.map(field=><div className={`min-w-0 ${["textarea","multi","array"].includes(field.kind??"")?"sm:col-span-2":""}`} key={field.key}>
      {field.kind==="boolean"?<label className="flex items-center gap-3 py-3 text-sm"><input type="checkbox" name={field.key} defaultChecked={Boolean(field.value)} className="h-4 w-4"/>{field.label}</label>:field.kind==="multi"?<fieldset><legend className="mb-2 text-sm font-semibold">{field.label}</legend>{field.options?.map(option=><label key={option.value} className="mb-2 flex items-start gap-3 rounded border border-slate-200 p-3 text-xs leading-6"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" name={field.key} value={option.value}/><span className="min-w-0 break-words">{option.label}</span></label>)}</fieldset>:<label className="block text-sm font-medium">{field.label}{field.group&&<span className="text-xs text-slate-500"> · khi sửa ánh xạ</span>}{field.kind==="select"?<select name={field.key} defaultValue={String(field.value??"")} className="mt-2 w-full rounded border border-slate-300 bg-white p-3">{field.nullable&&<option value="">Chưa xác định</option>}{field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:field.kind==="textarea"||field.kind==="array"?<textarea name={field.key} defaultValue={Array.isArray(field.value)?field.value.join("\n"):String(field.value??"")} rows={3} maxLength={3000} className="mt-2 w-full rounded border border-slate-300 p-3"/>:<input type={field.kind==="number"?"number":"text"} step={field.kind==="number"?"1":undefined} name={field.key} defaultValue={String(field.value??"")} maxLength={2000} className="mt-2 w-full rounded border border-slate-300 p-3"/>}</label>}
    </div>)}</div>
    <label className="block text-sm font-medium">Lý do / căn cứ rà soát<textarea name="reason" minLength={5} maxLength={1000} required rows={2} className="mt-2 w-full rounded border border-slate-300 p-3"/></label>
    <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name="confirm" required className="mt-1 h-4 w-4 shrink-0"/>Tôi đã rà soát quyền sử dụng và bằng chứng liên quan; xác nhận thao tác này.</label>
    <button disabled={busy} className="min-h-11 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy?"Đang xử lý…":label}</button><p role="status" className="text-sm leading-6 text-slate-700">{message}</p>
  </form>;
}
