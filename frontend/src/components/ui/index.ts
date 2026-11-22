/**
 * Barrel for the shared UI primitives library (Section 4 design system).
 * Import from `@/components/ui` — e.g. `import { Button, Badge } from '@/components/ui'`.
 */

export { Button, IconButton } from './button';
export type { ButtonProps, ButtonSize, ButtonVariant, IconButtonProps } from './button';

export { FieldWrapper, Input, Textarea } from './input';
export type { FieldWrapperProps, InputProps, TextareaProps } from './input';

export { Select } from './select';
export type { SelectOption, SelectProps } from './select';

export { Checkbox } from './checkbox';
export type { CheckboxProps } from './checkbox';

export { RadioGroup } from './radio-group';
export type { RadioGroupProps, RadioOption } from './radio-group';

export { Badge } from './badge';
export type { BadgeProps, BadgeVariant } from './badge';

export { Chip } from './chip';
export type { ChipProps } from './chip';

export { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

export { Popover, PopoverClose, PopoverContent, PopoverTrigger, DismissiblePopover } from './popover';
export type { DismissiblePopoverProps } from './popover';

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

export { Drawer, DrawerClose } from './drawer';
export type { DrawerProps } from './drawer';

export { Modal, ModalClose, ModalTrigger } from './modal';
export type { ModalProps } from './modal';

export { Breadcrumb } from './breadcrumb';
export type { BreadcrumbItem, BreadcrumbProps } from './breadcrumb';

export { Pagination } from './pagination';
export type { PaginationProps } from './pagination';

export { Skeleton, SkeletonCard, SkeletonListRow, SkeletonText } from './skeleton';
export type { SkeletonCardProps, SkeletonListRowProps, SkeletonProps, SkeletonTextProps } from './skeleton';

export { Toaster } from './toaster';

export { toast, useToastStore } from './toast-store';
export type { Toast, ToastInput, ToastVariant } from './toast-store';

export { DataTable, useDataTableState } from './data-table';
export type {
  DataTableColumn,
  DataTableProps,
  DataTableSort,
  DataTableState,
} from './data-table';

export { AvailabilityDot } from './availability-dot';
export type { AvailabilityDotProps, AvailabilityDotSize } from './availability-dot';

export { PriceBlock } from './price-block';
export type { PriceBlockDeliveryInfo, PriceBlockProps } from './price-block';

export { QuantityStepper } from './quantity-stepper';
export type { QuantityStepperProps } from './quantity-stepper';

export { EmptyState } from './empty-state';
export type { EmptyStateProps } from './empty-state';

export { ErrorState } from './error-state';
export type { ErrorStateProps } from './error-state';

export { Spinner } from './spinner';
export type { SpinnerProps } from './spinner';
