import { COURT_LENGTH } from './physics.js';

/**
 * Typical ATP Tour contact / launch values (men's averages, sea level).
 * Positions are meters; speed km/h; angles and spin-axis degrees; spin RPM.
 */
export const PRESETS = [
    {
        id: 'first-serve',
        label: '1st Serve',
        blurb: 'ATP average flat/slice',
        baseline: -0.8,
        distance: 0.45,
        height: 2.80,
        speed: 192,
        vAngle: -6,
        hAngle: 6,
        spin: 2500,
        axis: 25,
    },
    {
        id: 'kick-serve',
        label: 'Kick Serve',
        blurb: '7-to-1 brush: top + side',
        baseline: 0.8,
        distance: 0.45,
        height: 2.80,
        speed: 148,
        vAngle: -2,
        hAngle: 4,
        spin: 4500,
        axis: 60,
    },
    {
        id: 'slice-serve',
        label: 'Slice Serve',
        blurb: 'Sidespin wide to the deuce',
        baseline: -0.9,
        distance: 0.45,
        height: 2.75,
        speed: 170,
        vAngle: -5,
        hAngle: 11,
        spin: 3100,
        axis: 8,
    },
    {
        id: 'forehand',
        label: 'Forehand',
        blurb: 'Rally ball, heavy topspin',
        baseline: -1.6,
        distance: 1.4,
        height: 1.15,
        speed: 115,
        vAngle: 8,
        hAngle: 3,
        spin: 2800,
        axis: 90,
    },
    {
        id: 'backhand',
        label: 'Backhand',
        blurb: 'Two-hand drive',
        baseline: 1.4,
        distance: 1.2,
        height: 1.05,
        speed: 100,
        vAngle: 10,
        hAngle: -3,
        spin: 2300,
        axis: 85,
    },
    {
        id: 'drop-shot',
        label: 'Drop Shot',
        blurb: 'Backspin, dies after the net',
        baseline: -0.5,
        distance: 8,
        height: 0.95,
        speed: 34,
        vAngle: 16,
        hAngle: 1,
        spin: 2000,
        axis: 270,
    },
];

export const DEFAULT_PRESET_ID = 'first-serve';

export function startZ(distanceFromBaseline) {
    return -COURT_LENGTH / 2 + distanceFromBaseline;
}
