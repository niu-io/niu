import { useState } from 'react';
import { IconFolder, IconPlus, IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

/** Provider-native composition. No upstream mutation is performed by this review flow. */
export default function VolcengineView({workspaceName, initialSection='materials'}:{workspaceName:string;model?:string;initialSection?:string}) {
  const [section,setSection]=useState(initialSection);
  const [dialog,setDialog]=useState<'group'|'verification'|null>(null);
  const [name,setName]=useState('');
  function open(value:'group'|'verification'){setName('');setDialog(value);}
  return <div className="w-full min-w-0 space-y-6">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4"><div className="space-y-1"><h2 className="text-2xl font-semibold tracking-tight">Video</h2><p className="text-sm text-muted-foreground">Manage reference materials and identity verification for video generation.</p></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Video model family">Seedance<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value="seedance"><DropdownMenuRadioItem value="seedance">Seedance</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
    </div>
    <Tabs value={section==='verification' ? 'verification':'materials'} onValueChange={setSection} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><TabsList><TabsTrigger value="materials">Materials</TabsTrigger><TabsTrigger value="verification">Human verification</TabsTrigger></TabsList>{section==='verification' && <Button variant="outline" onClick={()=>open('verification')}><IconPlus size={16}/>Start verification</Button>}</div>
      <TabsContent value="materials"><section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Material group">Choose group<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={()=>open('group')}><IconPlus size={16}/>New group</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem disabled>Edit group</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="outline" disabled><IconPlus size={14}/>Add material</Button></div>
        <Empty className="min-h-80 rounded-xl border-0 bg-muted/30 px-4 md:px-4"><EmptyHeader><IconFolder className="mx-auto mb-2 text-muted-foreground" size={28} stroke={1.5}/><EmptyTitle className="text-sm">Select a group to view materials</EmptyTitle><EmptyDescription>Manage the group’s reference materials and processing status.</EmptyDescription></EmptyHeader></Empty>
      </section></TabsContent>
      <TabsContent value="verification"><Unavailable heading="Verification sessions" title="Verify a person" description="The person verifies on Volcengine’s page. A separate status check confirms the result."/></TabsContent>
    </Tabs>
    <Dialog open={dialog!==null} onOpenChange={value=>{if(!value)setDialog(null);}}><DialogContent><DialogHeader><DialogTitle>{dialog==='group' ? 'New material group':'Human verification'}</DialogTitle><DialogDescription>{dialog==='group' ? 'Create a Volcengine material group for this workspace.' : 'The person completes verification on Volcengine’s page. Niu then checks the result.'}</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="space-y-2"><Label htmlFor="volcengine-name">{dialog==='group' ? 'Group name':'Person name'}</Label><Input id="volcengine-name" value={name} onChange={e=>setName(e.target.value)} maxLength={200}/></div><p className="text-sm text-muted-foreground">Workspace: {workspaceName}</p></div>
      <DialogFooter><Button variant="ghost" onClick={()=>setDialog(null)}>Cancel</Button><Button disabled>{dialog==='group' ? 'Create group':'Open verification'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
function Unavailable({heading,title,description}:{heading:string;title:string;description:string}) { return <div className="rounded-xl bg-muted/35 p-5 sm:p-6"><h3 className="text-base font-semibold">{heading}</h3><Empty className="min-h-64 border-0 py-12"><EmptyHeader><IconFolder className="mx-auto mb-2 text-muted-foreground" size={28} stroke={1.5}/><EmptyTitle className="text-sm font-medium">{title}</EmptyTitle><EmptyDescription className="max-w-sm text-sm">{description}</EmptyDescription></EmptyHeader></Empty></div>; }
