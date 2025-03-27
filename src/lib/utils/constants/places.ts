export interface Place {
    displayName: string;
    zipCode: string;
    longitude: number;
    latitude: number;
}

export const PLACES: Place[] = [
    {
        displayName: "San Francisco Downtown",
        zipCode: "94105",
        longitude: -122.4194,
        latitude: 37.7749
    },
    {
        displayName: "Silicon Valley - Palo Alto",
        zipCode: "94301",
        longitude: -122.1598,
        latitude: 37.4419
    },
    {
        displayName: "San Jose Downtown",
        zipCode: "95113",
        longitude: -121.8863,
        latitude: 37.3382
    },
    {
        displayName: "Berkeley Campus Area",
        zipCode: "94720",
        longitude: -122.2585,
        latitude: 37.8719
    },
    {
        displayName: "Oakland City Center",
        zipCode: "94612",
        longitude: -122.2712,
        latitude: 37.8044
    }
];
