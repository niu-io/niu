import {useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {usePlatformCurrency} from '@/app/platform-currency';
import {currencySymbol} from '@/lib/money';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuRadioGroup,DropdownMenuRadioItem} from '@/components/ui/dropdown-menu';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {request} from '@/features/providers/api';

const names = new Intl.DisplayNames(['en'], {type:'currency'});
const currencies = Intl.supportedValuesOf('currency').filter(code=>!['XXX','XTS'].includes(code));
const description = (code:string)=>`${names.of(code) ?? code} (${code}) · ${currencySymbol(code)}`;

export function PlatformCurrencySetting({token}:{token:string}) {
 const {currency,reload,ready,failed}=usePlatformCurrency();
 const [draft,setDraft]=useState('');
 const [query,setQuery]=useState('');
 const [saving,setSaving]=useState(false);
 const [confirm,setConfirm]=useState(false);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState('');
 const current=currency||saved;
 async function save(){
  if(saving||!currencies.includes(draft))return;
  setSaving(true);setError('');
  try{await request(token,'/api/v1/platform/currency','PUT',{currency:draft});setSaved(draft);setConfirm(false);reload();}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not save currency. Try again.');}
  finally{setSaving(false);}
 }
 return <section className="space-y-4" aria-label="Platform currency">
  <div><h2 className="text-lg font-semibold">Platform currency</h2><p className="mt-1 text-sm text-muted-foreground">The currency for pricing, balances, spending limits, and reports across all workspaces.</p></div>
  {ready===false?<p role="status">Loading currency…</p>:failed&&!current?<div role="alert" className="space-y-2"><p>Could not load the platform currency.</p><Button variant="outline" onClick={reload}>Retry</Button></div>:current?<div className="space-y-2"><p className="font-medium">{description(current)}</p><p className="text-sm text-muted-foreground">Configured for this installation. Changing currency requires a data migration; existing amounts are never converted automatically.</p>{saved&&<p role="status" className="text-sm">Platform currency saved.</p>}</div>:<>
   <div className="flex flex-wrap items-end gap-3"><div className="grid min-w-0 gap-2"><Label htmlFor="platform-currency">Currency</Label><DropdownMenu onOpenChange={()=>setQuery('')}><DropdownMenuTrigger asChild><Button id="platform-currency" variant="outline" disabled={saving} className="w-full max-w-full justify-between gap-4 sm:w-80"><span className="truncate">{draft?description(draft):'Choose currency'}</span><ChevronDown className="size-4 shrink-0"/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)]"><div className="p-2"><Input aria-label="Search currencies" placeholder="Search name or code…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key.length===1||['Home','End','ArrowLeft','ArrowRight',' '].includes(event.key))event.stopPropagation();}}/></div><DropdownMenuRadioGroup value={draft} onValueChange={value=>{setDraft(value);setError('');}} className="max-h-64 overflow-y-auto">{currencies.filter(code=>description(code).toLowerCase().includes(query.toLowerCase().trim())).map(code=><DropdownMenuRadioItem key={code} value={code}>{description(code)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{!currencies.some(code=>description(code).toLowerCase().includes(query.toLowerCase().trim()))&&<p className="p-3 text-sm text-muted-foreground">No currencies found.</p>}</DropdownMenuContent></DropdownMenu></div><Button disabled={!draft||saving} onClick={()=>setConfirm(true)}>Save currency</Button></div>
   <p className="text-sm text-muted-foreground">Choose once during setup. All workspaces inherit this currency. Historical amounts keep their original currency.</p>
  </>}
  <Dialog open={confirm} onOpenChange={value=>{if(!saving)setConfirm(value);}}><DialogContent><DialogHeader><DialogTitle>Set platform currency?</DialogTitle><DialogDescription>Use {draft?description(draft):''} for all new pricing, balances, and spending limits. This setting cannot be changed here after saving. Existing amounts keep their original currency.</DialogDescription></DialogHeader>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setConfirm(false)}>Cancel</Button><Button disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Confirm currency'}</Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
