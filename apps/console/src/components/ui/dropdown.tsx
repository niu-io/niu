import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type DropdownValueChange = { target: { value: string } };
type DropdownOptionProps = {
  value?: string | number;
  children: React.ReactNode;
  disabled?: boolean;
};

function DropdownOption(_props: DropdownOptionProps) {
  return null;
}

type DropdownProps = Omit<React.ComponentProps<'button'>, 'value' | 'defaultValue' | 'onChange' | 'children'> & {
  value?: string | number;
  defaultValue?: string | number;
  size?: 'sm' | 'default';
  placeholder?: string;
  onChange?: (event: DropdownValueChange) => void;
  children: React.ReactNode;
};

function Dropdown({
  className,
  size = 'default',
  value,
  defaultValue,
  onChange,
  placeholder = 'Choose…',
  children,
  ...triggerProps
}: DropdownProps) {
  const options = React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement<DropdownOptionProps>(child) || child.type !== DropdownOption) return [];
    const contentValue = typeof child.props.children === 'string' || typeof child.props.children === 'number'
      ? String(child.props.children).trim()
      : '';
    return [{ ...child.props, value: child.props.value ?? contentValue }];
  });
  const selectedValue = value === undefined ? undefined : String(value);
  const initialValue = defaultValue === undefined ? (selectedValue === undefined ? String(options[0]?.value ?? '') : undefined) : String(defaultValue);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(initialValue ?? '');
  const effectiveValue = selectedValue ?? uncontrolledValue;
  const displayedOption = options.find(option => String(option.value) === effectiveValue);
  const emptyValue = '__niu_dropdown_empty_value__';

  return <DropdownMenu defaultOpen={false}>
    <div className="app-dropdown-wrapper" data-slot="app-dropdown-wrapper">
      <DropdownMenuTrigger
        {...triggerProps}
        type={triggerProps.type ?? 'button'}
        className={cn('app-dropdown-trigger', `app-dropdown-trigger-${size}`, className)}
        data-slot="app-dropdown-trigger"
        data-size={size}
      >
        <span className="app-dropdown-value">{displayedOption?.children ?? placeholder}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </DropdownMenuTrigger>
        <DropdownMenuContent className="app-dropdown-content" align="start" sideOffset={5} collisionPadding={10}>
          <DropdownMenuRadioGroup
            value={effectiveValue || emptyValue}
            onValueChange={next => {
              const nextValue = next === emptyValue ? '' : next;
              if (selectedValue === undefined) setUncontrolledValue(nextValue);
              onChange?.({ target: { value: nextValue } });
            }}
          >
            {options.map((option, index) => {
              const optionValue = String(option.value ?? '') || emptyValue;
              return <DropdownMenuRadioItem key={optionValue + '-' + index} value={optionValue} disabled={option.disabled} className="app-dropdown-item">
                <span>{option.children}</span>
              </DropdownMenuRadioItem>;
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
    </div>
  </DropdownMenu>;
}

export { Dropdown, DropdownOption };
