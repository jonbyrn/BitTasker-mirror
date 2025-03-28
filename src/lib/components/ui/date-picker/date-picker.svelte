<!-- src/lib/components/ui/date-picker/date-picker.svelte -->
<script lang="ts">
  import { Calendar } from "$lib/components/ui/calendar";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  import { calendar } from "lucide-svelte";
  import { format } from "date-fns";
  import * as Popover from "$lib/components/ui/popover";

  export let value: Date | undefined = undefined;
  export let placeholder = "Pick a date";
  export let class: string | undefined = undefined;

  $effect(() => {
    if (value) {
      console.log('Selected date:', value);
    }
  });

  let dateStr = $derived(
    value ? format(value, "PPP") : placeholder
  );
</script>

<Popover.Root>
  <Popover.Trigger asChild let:builder>
    <Button
      builders={[builder]}
      variant="outline"
      class={cn(
        "w-full justify-start text-left font-normal",
        !value && "text-muted-foreground",
        class
      )}
    >
      <calendar class="mr-2 h-4 w-4" />
      {dateStr}
    </Button>
  </Popover.Trigger>
  <Popover.Content class="w-auto p-0">
    <Calendar
      mode="single"
      selected={value}
      onSelect={(date) => (value = date)}
      initialFocus
    />
  </Popover.Content>
</Popover.Root>
