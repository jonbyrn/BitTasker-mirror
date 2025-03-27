<script lang="ts">
    import { Meta, Story } from '@storybook/addon-svelte-csf';
    import Input from '$lib/components/Input.svelte';
    
    const meta = {
        title: 'Components/Input',
        component: Input,
        parameters: {
            layout: 'centered'
        },
        argTypes: {
            id: { control: 'text' },
            label: { control: 'text' },
            value: { control: 'text' },
            placeholder: { control: 'text' },
            error: { control: 'text' }
        }
    } satisfies Meta;
</script>

<Meta {...meta} />

<Story
    name="Default"
    args={{
        id: 'location',
        label: 'Location',
        placeholder: 'Enter address or ZIP code'
    }}
    let:args
>
    <div class="w-96">
        <Input {...args} />
    </div>
</Story>

<Story
    name="With Error"
    args={{
        id: 'location-error',
        label: 'Location',
        placeholder: 'Enter address or ZIP code',
        error: 'Please select a valid location'
    }}
    let:args
>
    <div class="w-96">
        <Input {...args} />
    </div>
</Story>

<Story
    name="With Initial Value"
    args={{
        id: 'location-value',
        label: 'Location',
        value: 'San Francisco Downtown',
        placeholder: 'Enter address or ZIP code'
    }}
    let:args
>
    <div class="w-96">
        <Input {...args} />
    </div>
</Story>
