import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";

/**
 * Searchable supplier selector (type to filter). value = supplier id ("" = none).
 */
const SupplierCombobox = ({
  suppliers,
  value,
  onChange,
  placeholder = "Search supplier…",
  testid = "supplier-combobox",
  allowClear = false,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const selected = suppliers.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          data-testid={testid}
          className={`flex items-center justify-between h-12 w-full rounded-sm border border-input bg-background px-3 text-sm ${className}`}
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? selected.name : placeholder}
          </span>
          <span className="flex items-center gap-1">
            {allowClear && selected && (
              <X
                size={16}
                className="opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                data-testid={`${testid}-clear`}
              />
            )}
            <ChevronsUpDown size={16} className="opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[240px]" align="start">
        <Command>
          <CommandInput placeholder="Type to search…" data-testid={`${testid}-input`} />
          <CommandList>
            <CommandEmpty>No supplier found.</CommandEmpty>
            <CommandGroup>
              {suppliers.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                  data-testid={`${testid}-opt-${s.id}`}
                >
                  <Check
                    size={16}
                    className={`mr-2 ${value === s.id ? "opacity-100" : "opacity-0"}`}
                  />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SupplierCombobox;
