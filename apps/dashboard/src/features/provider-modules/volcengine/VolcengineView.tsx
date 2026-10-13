import { useState } from 'react';
import { IconFolder, IconUserScan, IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';

/** Provider-native composition. No upstream mutation is performed by this review flow. */
export default function VolcengineView({workspaceName, model, initialSection='materials'}:{workspaceName:string;model?:string;initialSection?:string}) {
  const [section,setSection]=useState(initialSection);
  const [dialog,setDialog]=useState<'group'|'verification'|null>(null);
  const [name,setName]=useState('');
  function open(value:'group'|'verification'){setName('');setDialog(value);}
  return <div className="min-w-0 space-y-6">
    <div className="space-y-1"><h2 className="text-lg font-semibold">Volcengine</h2><p className="text-sm text-muted-foreground">{workspaceName}{model ? ` · ${model}` : ''}</p></div>
    <div className="grid min-w-0 gap-6 sm:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Volcengine capabilities"><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive={section==='materials'} onClick={()=>setSection('materials')}><IconFolder/><span>Materials</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton isActive={section==='verification'} onClick={()=>setSection('verification')}><IconUserScan/><span>Human verification</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></nav>
      <section className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{section==='materials' ? 'Materials' : 'Human verification'}</h3><Button variant="outline" onClick={()=>open(section==='materials' ? 'group':'verification')}><IconPlus size={16}/>{section==='materials' ? 'New material group':'Start verification'}</Button></div>
        {section==='materials' ? <Tabs defaultValue="groups"><TabsList><TabsTrigger value="groups">Groups</TabsTrigger><TabsTrigger value="materials">Materials</TabsTrigger></TabsList>
          <TabsContent value="groups"><Unavailable title="Material groups cannot be loaded" description="Workspace access to Volcengine materials is not connected yet. Existing groups have not been queried."/></TabsContent>
          <TabsContent value="materials"><Unavailable title="Materials cannot be loaded" description="Once connected, this view shows only this workspace’s registered materials and their processing status."/></TabsContent>
        </Tabs> : <Unavailable title="Verification records cannot be loaded" description="Workspace access to verification sessions is not connected yet. Returning from the provider’s verification page will require a separate status check."/>}
      </section>
    </div>
    <Dialog open={dialog!==null} onOpenChange={value=>{if(!value)setDialog(null);}}><DialogContent><DialogHeader><DialogTitle>{dialog==='group' ? 'New material group':'Human verification'}</DialogTitle><DialogDescription>{dialog==='group' ? 'Create a Volcengine material group for this workspace.' : 'The person completes verification on Volcengine’s page. Niu then checks the result.'}</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="space-y-2"><Label htmlFor="volcengine-name">{dialog==='group' ? 'Group name':'Person name'}</Label><Input id="volcengine-name" value={name} onChange={e=>setName(e.target.value)} maxLength={200}/></div><p className="text-sm text-muted-foreground">Workspace: {workspaceName}</p><p role="status" className="text-sm text-muted-foreground">This flow is available for review. Saving and opening verification require the workspace integration; nothing will be submitted.</p></div>
      <DialogFooter><Button variant="ghost" onClick={()=>setDialog(null)}>Cancel</Button><Button disabled>{dialog==='group' ? 'Create group':'Open verification'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
function Unavailable({title,description}:{title:string;description:string}) { return <Empty className="border-0 py-10"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>; }
