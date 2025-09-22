<script lang="ts">
  import { t } from 'svelte-i18n';
  
  interface Props {
    value: any;
    onChange: (value: any) => void;
    type?: 'single' | 'range' | 'datetime' | 'time';
    minDate?: Date | string;
    maxDate?: Date | string;
    labelKey?: string;
    placeholderKey?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    timeStep?: number; // Step in minutes for time inputs (default: 15)
  }
  
  let { 
    value = $bindable(),
    onChange,
    type = 'single',
    minDate,
    maxDate,
    labelKey = '',
    placeholderKey = '',
    disabled = false,
    required = false,
    className = '',
    timeStep = 15, // Default to 15-minute intervals
  } = $props();
  
  // Reactive localized text
  let localizedLabel = $derived(
    !labelKey ? '' : $t(labelKey)
  );
  
  let localizedPlaceholder = $derived(
    !placeholderKey ? '' : $t(placeholderKey)
  );
  
  // Convert value to HTML5 input format
  function getInputValue() {
    if (!value) return '';
    
    if (type === 'range' && typeof value === 'object' && value.start && value.end) {
      return value.start instanceof Date ? value.start.toISOString().split('T')[0] : value.start.split('T')[0];
    }
    
    if (value instanceof Date) {
      if (type === 'datetime' || type === 'time') {
        // For datetime-local, we need to format as YYYY-MM-DDTHH:MM
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        const hours = String(value.getHours()).padStart(2, '0');
        const minutes = String(value.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      } else {
        return value.toISOString().split('T')[0];
      }
    }
    
    if (typeof value === 'string' && value.trim()) {
      if (type === 'datetime' || type === 'time') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        }
      } else {
        return value.split('T')[0];
      }
    }
    
    return '';
  }
  
  // Convert HTML5 input value back to Date or range object
  function handleInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    let inputValue = target.value;
    
    if (!inputValue) {
      onChange?.(null);
      return;
    }
    
    // Round time to 15-minute intervals for time and datetime inputs
    if ((type === 'time' || type === 'datetime') && timeStep) {
      const originalValue = inputValue;
      inputValue = roundTimeToStep(inputValue, timeStep);
      if (originalValue !== inputValue) {
        target.value = inputValue; // Update the input with rounded value
        console.log(`Time rounded from ${originalValue} to ${inputValue}`);
      }
    }
    
    if (type === 'range') {
      // For range, we need to handle start and end separately
      // This is a simplified version - you might need to handle this differently
      const date = new Date(inputValue);
      if (!isNaN(date.getTime())) {
        onChange?.({ start: date, end: date });
      }
    } else {
      const date = new Date(inputValue);
      if (!isNaN(date.getTime())) {
        onChange?.(date);
      }
    }
  }
  
  // Round time to the nearest step interval
  function roundTimeToStep(timeValue: string, stepMinutes: number): string {
    if (type === 'time') {
      // Handle time input (HH:MM format)
      const timeParts = timeValue.split(':');
      if (timeParts.length !== 2) return timeValue;
      
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      
      if (isNaN(hours) || isNaN(minutes)) return timeValue;
      
      const roundedMinutes = Math.round(minutes / stepMinutes) * stepMinutes;
      
      if (roundedMinutes >= 60) {
        const newHours = (hours + 1) % 24;
        const newMinutes = 0;
        return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
      }
      
      return `${hours.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`;
    } else if (type === 'datetime') {
      // Handle datetime input (YYYY-MM-DDTHH:MM format)
      const [datePart, timePart] = timeValue.split('T');
      if (!timePart) return timeValue;
      
      const timeParts = timePart.split(':');
      if (timeParts.length !== 2) return timeValue;
      
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      
      if (isNaN(hours) || isNaN(minutes)) return timeValue;
      
      const roundedMinutes = Math.round(minutes / stepMinutes) * stepMinutes;
      
      let newHours = hours;
      let newMinutes = roundedMinutes;
      
      if (roundedMinutes >= 60) {
        newHours = (hours + 1) % 24;
        newMinutes = 0;
      }
      
      return `${datePart}T${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
    }
    
    return timeValue;
  }
  
  // Get input type based on component type
  function getInputType() {
    switch (type) {
      case 'datetime':
        return 'datetime-local';
      case 'time':
        return 'time';
      case 'range':
        return 'date';
      default:
        return 'date';
    }
  }
  
  // Get min/max attributes
  function getMinValue() {
    if (!minDate) return '';
    const date = minDate instanceof Date ? minDate : new Date(minDate);
    return date.toISOString().split('T')[0];
  }
  
  function getMaxValue() {
    if (!maxDate) return '';
    const date = maxDate instanceof Date ? maxDate : new Date(maxDate);
    return date.toISOString().split('T')[0];
  }
  
  // Get step attribute for time inputs
  function getStepValue() {
    if (type === 'time' || type === 'datetime') {
      // Convert minutes to seconds for HTML5 step attribute
      return timeStep * 60;
    }
    return undefined; // No step for date inputs
  }
</script>

{#if localizedLabel}
  <label for="date-input" class="block text-sm font-medium select-none">
    {localizedLabel}
    {#if required}
      <span class="text-error">*</span>
    {/if}
  </label>
{/if}

<div class="date-input-container {className}">
  <input
    id="date-input"
    type={getInputType()}
    value={getInputValue()}
    onchange={handleInputChange}
    oninput={handleInputChange}
    onblur={handleInputChange}
    {disabled}
    {required}
    min={getMinValue()}
    max={getMaxValue()}
    step={getStepValue()}
    placeholder={localizedPlaceholder}
    class="input input-bordered w-full"
  />
  {#if (type === 'time' || type === 'datetime') && timeStep && timeStep !== 1}
    <div class="text-xs text-base-content/60 mt-1">
      Times will be rounded to {timeStep}-minute intervals
    </div>
  {/if}
</div>

<style>
  /* Custom styling for HTML5 date inputs to match project theme */
  .date-input-container input[type="date"],
  .date-input-container input[type="datetime-local"],
  .date-input-container input[type="time"] {
    background-color: var(--color-base-100);
    color: var(--color-base-content);
    border-color: var(--color-base-300);
    border-radius: var(--radius-box);
    font-family: var(--font-sans);
  }
  
  .date-input-container input[type="date"]:focus,
  .date-input-container input[type="datetime-local"]:focus,
  .date-input-container input[type="time"]:focus {
    border-color: var(--color-primary);
    outline: none;
    box-shadow: 0 0 0 2px rgba(from var(--color-primary) r g b / 0.2);
  }
  
  
  /* Error state */
  .date-input-container.input-error input {
    border-color: var(--color-error);
  }
  
  .date-input-container.input-error input:focus {
    border-color: var(--color-error);
    box-shadow: 0 0 0 2px rgba(from var(--color-error) r g b / 0.2);
  }
</style>
