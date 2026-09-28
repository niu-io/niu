import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export default function ModalFrame({ open, onOpenChange, title, description, children, className = '', overlayClassName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`niu-modal${className ? ` ${className}` : ''}`} overlayClassName={overlayClassName ?? 'niu-modal-overlay'} showCloseButton={false}>
      <header className="niu-modal-heading">
        <div><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div>
        <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
      </header>
      {children}
    </DialogContent>
  </Dialog>;
}
