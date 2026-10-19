import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { AdminShell } from "../components/admin/admin-shell";
import { AdminListView, AdminBriefPreview, AdminReviewWarnings } from "../components/admin/admin-view";
import { AdminForm } from "../components/admin/admin-form";
import type { AdminList } from "../services/admin-query";
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
const list:AdminList={section:'stories',rows:[{id:'a0000000-0000-4000-8000-000000000001',titleVi:'Tin đang chờ duyệt',processingStatus:'NEEDS_REVIEW',publicationStatus:'DRAFT',sourceName:'Nguồn đã rà soát'}],page:1,hasNext:true,filters:{page:1,q:''},competitions:[]};
describe('Vietnamese operational admin views',()=>{
  it('offers semantic navigation, selected section and bounded pagination',()=>{
    const $=load(renderToStaticMarkup(<AdminShell section="stories"><AdminListView list={list}/></AdminShell>));
    expect($('h1').text()).toContain('Duyệt tin');expect($('nav[aria-label="Quản trị"] a[aria-current="page"]').attr('href')).toBe('/admin/stories');expect($('a[href*="page=2"]').text()).toContain('Trang sau');expect($('h2').first().text()).toBe('Tin đang chờ duyệt');expect($('body').text()).not.toContain('NEEDS_REVIEW');
  });
  it('sensitive forms require a reason, confirmation and accessible state output',()=>{
    const $=load(renderToStaticMarkup(<AdminForm action="ARTICLE_APPROVE" id={list.rows[0].id} label="Duyệt & xuất bản" danger/>));
    expect($('textarea[name="reason"]').attr('required')).toBeDefined();expect($('input[name="confirm"]').attr('required')).toBeDefined();expect($('[role="status"]').length).toBe(1);expect($('button').text()).toContain('Duyệt');
  });
  it('invalid/revoked brief cannot expose a publication action',()=>{
    const $=load(renderToStaticMarkup(<AdminBriefPreview brief={null} id={list.rows[0].id}/>));expect($('button')).toHaveLength(0);expect($('body').text()).toContain('chưa đủ điều kiện');
  });
  it('empty lists and filters are useful without raw data placeholders',()=>{
    const $=load(renderToStaticMarkup(<AdminListView list={{...list,rows:[],hasNext:false}}/>));expect($('[role="status"]').first().text()).toContain('Không có bản ghi');expect($('select[name="league"] option')).toHaveLength(3);expect($('body').text()).not.toMatch(/undefined|null/);const warning=renderToStaticMarkup(<AdminReviewWarnings warnings={['TRANSLATION_REQUIRED','GENERATED_CLAIM_NOT_REVIEWED']}/>);expect(warning).toContain('Cần xử lý tiếng Việt');expect(warning).not.toContain('TRANSLATION_REQUIRED');
  });
});
