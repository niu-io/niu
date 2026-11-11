import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const CELL_WIDTHS = ['w-44', 'w-24', 'w-20', 'w-28', 'w-16', 'w-32', 'w-20', 'w-12'] as const;

export function TableSkeleton({
  label,
  columns = 5,
  rows = 6,
  headers,
  columnClassNames,
  cellWidths,
  tableClassName,
  className,
}: {
  label: string;
  columns?: number;
  rows?: number;
  headers?: string[];
  columnClassNames?: Array<string | undefined>;
  cellWidths?: string[];
  tableClassName?: string;
  className?: string;
}) {
  const colCount = headers?.length ?? columns;
  return (
    <div
      role={label ? 'status' : undefined}
      aria-busy={label ? 'true' : undefined}
      className={cn('w-full min-w-0', className)}
    >
      {label && <span className="mb-2 block text-sm text-muted-foreground">{label}</span>}
      <Table className={tableClassName}>
        <TableHeader>
          <TableRow>
            {Array.from({ length: colCount }, (_, colIndex) => (
              <TableHead key={colIndex} className={columnClassNames?.[colIndex]}>
                {headers ? (
                  headers[colIndex]
                ) : (
                  <Skeleton className={cn('h-3.5', colIndex === 0 ? 'w-28' : 'w-20')} />
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: colCount }, (__, colIndex) => (
                <TableCell key={colIndex} className={columnClassNames?.[colIndex]}>
                  <Skeleton
                    className={cn(
                      'h-4 max-w-full',
                      columnClassNames?.[colIndex]?.includes('text-right') && 'ml-auto',
                      cellWidths?.[colIndex] ??
                        (colIndex === colCount - 1 && columnClassNames?.[colIndex]?.includes('text-right')
                          ? 'w-8'
                          : CELL_WIDTHS[(colIndex + rowIndex) % CELL_WIDTHS.length]),
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function MetricStripSkeleton({
  label,
  count = 4,
  className,
}: {
  label?: string;
  count?: number;
  className?: string;
}) {
  return (
    <div
      role={label ? 'status' : undefined}
      aria-busy={label ? 'true' : undefined}
      className={cn('grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}
    >
      {label && <span className="col-span-full mb-1 block text-sm text-muted-foreground">{label}</span>}
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="panel space-y-2.5 p-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}

export function ChartPanelSkeleton({
  label,
  compact = false,
  className,
}: {
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const barHeights = ['h-12', 'h-20', 'h-16', 'h-28', 'h-24', 'h-32', 'h-14', 'h-24', 'h-20', 'h-28', 'h-16', 'h-24'];
  return (
    <div
      role={label ? 'status' : undefined}
      aria-busy={label ? 'true' : undefined}
      className={cn('grid w-full gap-4', compact ? 'lg:grid-cols-2' : 'lg:grid-cols-2', className)}
    >
      {label && <span className="col-span-full mb-1 block text-sm text-muted-foreground">{label}</span>}
      {[0, 1].map(panelIdx => (
        <div key={panelIdx} className="panel space-y-4 p-5">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <div className={cn('flex items-end gap-2 pt-2', compact ? 'h-32' : 'h-44')}>
            {barHeights.map((heightClass, barIdx) => (
              <Skeleton key={barIdx} className={cn('flex-1 rounded-sm', heightClass)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormSectionSkeleton({
  label,
  fields = 3,
  className,
}: {
  label: string;
  fields?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" className={cn('w-full space-y-6 py-2', className)}>
      <span className="mb-2 block text-sm text-muted-foreground">{label}</span>
      <div className="space-y-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: fields }, (_, idx) => (
          <div key={idx} className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-9 w-full max-w-md" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

export function ListRowsSkeleton({
  label,
  rows = 4,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" className={cn('w-full space-y-3 py-1', className)}>
      <span className="mb-2 block text-sm text-muted-foreground">{label}</span>
      {Array.from({ length: rows }, (_, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-5 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function WorkspaceShellSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="w-full space-y-6 py-2">
      <span className="mb-2 block text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <MetricStripSkeleton count={4} />
      <TableSkeleton label="" rows={5} columns={5} />
    </div>
  );
}
