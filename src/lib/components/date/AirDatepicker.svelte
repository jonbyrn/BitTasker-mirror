<script lang="ts">
  import AirDatepicker from 'air-datepicker';
  import localeEn from 'air-datepicker/locale/en';
  import localeEs from 'air-datepicker/locale/es';
  import { onMount, onDestroy } from 'svelte';
  import { locale } from 'svelte-i18n';
  import { t } from 'svelte-i18n';
  import { isI18nLoading } from '$lib/i18n/i18n';
  
  interface Props {
    // Core props
    value: any;
    onChange: (value: any) => void;
    
    // Type-specific props
    type?: 'single' | 'range' | 'datetime' | 'time';
    
    // Shared props
    minDate?: Date | string;
    maxDate?: Date | string;
    labelKey?: string;
    placeholderKey?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
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
  } = $props();
  
  let datepicker: AirDatepicker;
  let inputElement: HTMLInputElement;
  
  // Locale mapping
  const localeMap = {
    'en': localeEn,
    'es': localeEs
  };
  
  // Reactive locale
  let currentLocale = $derived(localeMap[$locale] || localeEn);
  
  // Reactive localized text
  let localizedLabel = $derived(
    !labelKey || $isI18nLoading ? '' : 
    ($t(`common.${labelKey}`) === `common.${labelKey}` ? '' : $t(`common.${labelKey}`))
  );
  
  let localizedPlaceholder = $derived(
    !placeholderKey || $isI18nLoading ? '' : 
    ($t(`common.${placeholderKey}`) === `common.${placeholderKey}` ? '' : $t(`common.${placeholderKey}`))
  );
  
  // Add Today and Clear button translations
  let todayText = $derived($t('common.today', { default: 'Today' }));
  let clearText = $derived($t('common.clear', { default: 'Clear' }));
  
  
  // Type-specific configuration
  function getTypeConfig(type: string) {
    switch (type) {
      case 'single':
        return { 
          multipleDates: false, 
          timepicker: false,
          range: false
        };
      case 'range':
        return { 
          range: true,
          timepicker: false
        };
      case 'datetime':
        return { 
          multipleDates: false, 
          timepicker: true,
          range: false,
          timeFormat: 'HH:mm'
        };
      case 'time':
        return { 
          multipleDates: false, 
          timepicker: true,
          onlyTimepicker: true,
          range: false,
          timeFormat: 'HH:mm'
        };
      default:
        return { 
          multipleDates: false, 
          timepicker: false,
          range: false
        };
    }
  }
  
  function getSelectedDates() {
    if (!value) return [];
    
    if (type === 'range' && typeof value === 'object' && 'start' in value) {
      const dates = [value.start, value.end].filter(date => date instanceof Date);
      return dates;
    }
    
    if (Array.isArray(value)) {
      return value.filter(date => date instanceof Date);
    }
    
    if (value instanceof Date) {
      return [value];
    }
    
    return [];
  }
  
  // Create stable button handlers to prevent recreation
  const clearHandler = (dp) => {
    // Clear the datepicker selection - this will also clear the input field
    dp.clear();
    dp.hide();
  };

  const todayHandler = (dp) => {
    const today = new Date();
    if (type === 'range') {
      // Set the datepicker selection - this will also update the input field
      dp.selectDate([today, today]);
    } else {
      // Set the datepicker selection - this will also update the input field
      dp.selectDate(today);
    }
    if (type === 'single' || type === 'datetime' || type === 'time') {
      dp.hide();
    }
  };

  // Reactive today date
  let today = $derived(new Date());
  
  // Configuration - create stable config object
  const config = $derived({
    locale: currentLocale,
    selectedDates: getSelectedDates(),
    minDate,
    maxDate,
    autoClose: true, // Auto-close for all selection types after selection is complete
    classes: `air-datepicker-custom${className && className.trim() ? ` ${className.trim()}` : ''}`,
    onSelect: handleSelect,
    dateFormat: 'MMMM d, yyyy',
    firstDay: 1,
    weekends: [6, 0],
    showOtherMonths: true,
    selectOtherMonths: true,
    moveToOtherMonthsOnSelect: true,
    disableNavWhenOutOfRange: true,
    keyboardNav: true,
    toggleSelected: true,
    position: 'bottom left',
    offset: 6,
    view: 'days',
    minView: 'days',
    multipleDatesSeparator: ' — ',
    isMobile: true,
    minutesStep: 15,
    // Add Today and Clear buttons using built-in buttons
    buttons: [
      {
        content: clearText,
        className: 'air-datepicker-clear-btn',
        onClick: clearHandler
      },
      {
        content: todayText,
        className: 'air-datepicker-today-btn',
        onClick: todayHandler
      }
    ],
    ...getTypeConfig(type)
  });
  
  // Create stable select handler to prevent recreation
  const handleSelect = ({ date, formattedDate, datepicker: dp }) => {
    // For range selection, only call onChange when the range is complete
    if (type === 'range') {
      // Check if we have a complete range (2 dates selected)
      const selectedDates = dp.selectedDates;
      if (selectedDates && selectedDates.length === 2) {
        // Range is complete, call onChange with the range object
        const range = {
          start: selectedDates[0],
          end: selectedDates[1]
        };
        onChange?.(range);
      }
    } else {
      // For single date, datetime, or time selection, call onChange immediately
      onChange?.(date);
    }
  };
  
  // Initialize datepicker when input element is available - only once
  $effect(() => {
    if (inputElement && !datepicker) {
      datepicker = new AirDatepicker(inputElement, config);
    }
  });
  
  // Update datepicker only when necessary (avoid interfering with user interaction)
  $effect(() => {
    if (datepicker && inputElement) {
      // Only update if the datepicker is not currently visible to avoid interrupting user interaction
      if (!datepicker.visible) {
        datepicker.update(config);
      }
    }
  });
  
  onDestroy(() => {
    datepicker?.destroy();
  });
</script>

{#if localizedLabel}
  <label for="air-datepicker-input" class="block text-sm font-medium select-none">
    {localizedLabel}
    {#if required}
      <span class="text-error">*</span>
    {/if}
  </label>
{/if}

<div class="air-datepicker-container {className}">
  <input
    id="air-datepicker-input"
    bind:this={inputElement}
    type="text"
    placeholder={localizedPlaceholder}
    {disabled}
    {required}
    class="input input-bordered w-full"
  />
</div>
