<script lang="ts">
  import { Meta, Story, Template } from '@storybook/addon-svelte-csf';
  import Location from '$lib/components/Location.svelte';
  
  const meta = {
    title: 'Components/Location',
    component: Location,
    argTypes: {
      label: { control: 'text' },
      defaultLocation: { control: 'object' },
      onLocationSelect: { action: 'locationSelected' }
    }
  };
</script>

<Meta {...meta} />

<Template let:args>
  <Location {...args} />
</Template>

<Story 
  name="Default"
  args={{
    label: 'Location',
    onLocationSelect: (loc) => console.log('Location selected:', loc)
  }}
/>

<Story 
  name="With Default Location"
  args={{
    label: 'Pickup Location',
    defaultLocation: {
      displayName: '123 Main St, San Francisco, CA',
      longitude: -122.4194,
      latitude: 37.7749,
      zipCode: '94105',
      locationLoaded: true
    },
    onLocationSelect: (loc) => console.log('Location selected:', loc)
  }}
/>

<style>
  :global(.sb-show-main) {
    padding: 1rem;
  }
</style>
