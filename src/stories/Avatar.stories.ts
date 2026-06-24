import type { Meta, StoryObj } from '@storybook/svelte';
import Avatar from '$lib/components/Avatar.svelte';

const meta = {
	title: 'Components/Avatar',
	component: Avatar,
	tags: ['autodocs'],
	argTypes: {
		size: {
			control: { type: 'select' },
			options: ['xs', 'sm', 'md', 'lg', 'xl'],
			description: 'Size of the avatar'
		},
		picture: {
			control: 'text',
			description: 'URL of the profile image'
		},
		name: {
			control: 'text',
			description: 'User name for initials fallback'
		}
	}
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic stories with different sizes
export const Default: Story = {
	args: {
		name: 'John Doe',
		picture: undefined,
		size: 'md'
	}
};

export const Small: Story = {
	args: {
		name: 'John Doe',
		picture: undefined,
		size: 'sm'
	}
};

export const Large: Story = {
	args: {
		name: 'John Doe',
		picture: undefined,
		size: 'lg'
	}
};

// With profile image
export const WithImage: Story = {
	args: {
		name: 'John Doe',
		picture: 'https://i.pravatar.cc/300',
		size: 'md'
	}
};

// Different names to show different colors and initials
export const DifferentUsers: Story = {
	render: () => ({
		Component: Avatar,
		props: { name: 'John Doe', picture: undefined, size: 'md' as const }
	})
};

// Show all sizes
export const AllSizes: Story = {
	render: () => ({
		Component: Avatar,
		props: { name: 'John Doe', picture: undefined, size: 'xl' as const }
	})
};
