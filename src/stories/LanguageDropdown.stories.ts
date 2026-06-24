import type { Meta, StoryObj } from '@storybook/svelte';
import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';

const meta = {
	title: 'Components/LanguageDropdown',
	component: LanguageDropdown,
	parameters: {
		layout: 'centered'
	},
	tags: ['autodocs']
} satisfies Meta<typeof LanguageDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		showTooltip: true,
		showLanguageCode: true,
		showCheckmark: true,
		className: ''
	}
};

export const WithoutTooltip: Story = {
	args: {
		showTooltip: false,
		showLanguageCode: true,
		showCheckmark: true,
		className: ''
	}
};

export const WithoutLanguageCode: Story = {
	args: {
		showTooltip: true,
		showLanguageCode: false,
		showCheckmark: true,
		className: ''
	}
};

export const WithoutCheckmark: Story = {
	args: {
		showTooltip: true,
		showLanguageCode: true,
		showCheckmark: false,
		className: ''
	}
};

export const Minimal: Story = {
	args: {
		showTooltip: false,
		showLanguageCode: false,
		showCheckmark: false,
		className: ''
	}
};
