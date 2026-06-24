import type { Meta, StoryObj } from '@storybook/svelte';
import TaskLocationViewer from '$lib/components/task/TaskLocationViewer.svelte';
import type { Location } from '$lib/types/task';

const meta = {
	title: 'Components/Task/TaskLocationViewer',
	component: TaskLocationViewer,
	parameters: {
		layout: 'padded',
		docs: {
			description: {
				component:
					'A read-only map component for displaying task locations in the review screen. Supports both single locations and pickup/dropoff with directions.'
			}
		}
	},
	tags: ['autodocs']
} satisfies Meta<typeof TaskLocationViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample locations for stories
const samplePickupLocation: Location = {
	displayName: '1600 Amphitheatre Parkway, Mountain View, CA, USA',
	latitude: 37.4221,
	longitude: -122.0844,
	zipCode: '94043',
	locationLoaded: true
};

const sampleDropoffLocation: Location = {
	displayName: '1 Hacker Way, Menlo Park, CA, USA',
	latitude: 37.4843,
	longitude: -122.1477,
	zipCode: '94025',
	locationLoaded: true
};

const downtownLocation: Location = {
	displayName: 'Union Square, San Francisco, CA, USA',
	latitude: 37.788,
	longitude: -122.4075,
	zipCode: '94108',
	locationLoaded: true
};

export const SingleLocation: Story = {
	args: {
		pickupLocation: samplePickupLocation,
		isRemovals: false,
		height: '400px',
		showDirections: true
	},
	parameters: {
		docs: {
			description: {
				story: 'Display a single task location for in-person tasks.'
			}
		}
	}
};

export const RemovalTask: Story = {
	args: {
		pickupLocation: samplePickupLocation,
		dropOffLocation: sampleDropoffLocation,
		isRemovals: true,
		height: '400px',
		showDirections: true
	},
	parameters: {
		docs: {
			description: {
				story:
					'Display pickup and dropoff locations with driving directions for removal/delivery tasks.'
			}
		}
	}
};

export const RemovalTaskWithoutDirections: Story = {
	args: {
		pickupLocation: samplePickupLocation,
		dropOffLocation: sampleDropoffLocation,
		isRemovals: true,
		height: '400px',
		showDirections: false
	},
	parameters: {
		docs: {
			description: {
				story:
					'Display pickup and dropoff locations without directions - useful when directions API is not available or when you just want to show the locations.'
			}
		}
	}
};

export const CompactMap: Story = {
	args: {
		pickupLocation: downtownLocation,
		isRemovals: false,
		height: '200px',
		showDirections: true
	},
	parameters: {
		docs: {
			description: {
				story: 'A compact version of the map viewer for use in smaller spaces or cards.'
			}
		}
	}
};

export const LargeMap: Story = {
	args: {
		pickupLocation: samplePickupLocation,
		dropOffLocation: sampleDropoffLocation,
		isRemovals: true,
		height: '600px',
		showDirections: true
	},
	parameters: {
		docs: {
			description: {
				story: 'A large map view for detailed location review.'
			}
		}
	}
};
