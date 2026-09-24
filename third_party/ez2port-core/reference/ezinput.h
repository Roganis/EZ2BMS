/* What the backend's event pump, and the device layer, owe the shared input
 * layer.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../../LICENSE.
 */
#ifndef EZ2_EZINPUT_H
#define EZ2_EZINPUT_H

#include <SDL3/SDL.h>

/* ---- what the BACKEND calls --------------------------------------------- */

/* Every key event the pump sees, with the time it arrived. Judgement needs the
 * arrival time, not the frame's - see platform.h. */
void ez2_input_key(SDL_Scancode sc, int down, unsigned int time_ms);

/* Every joystick and mouse-motion event, likewise. A pad button reaches
 * judgement on the same timestamped path a key does, which is the whole reason
 * this is an event and not a poll (ezpad.c says why at length). */
void ez2_pad_event(const SDL_Event *e);

/* Once a frame, after the events are drained: the virtual turntable steps and
 * the synthesised scratch holds expire. */
void ez2_pad_frame(unsigned int now);

/* ---- what ezpad.c and ezinput.c call of each other ---------------------- */

/* Raise or drop a channel outright, with a timestamp - how the turntable's
 * synthesised scratch directions get in. */
void ez2_input_channel(int channel, int down, unsigned int time_ms);

/* A device control moved: re-resolve every channel that has a device binding.
 * Cheap (26 channels x 4 alternates) and exact, which is what matters when a
 * channel can be raised by a key OR a pad button at the same time. */
void ez2_input_device_changed(unsigned int time_ms);

/* A device arrived or left: re-resolve device names to device indices. */
void ez2_input_rebind_devices(void);

/* Device state, read by the channel resolver. */
int ez2_pad_index_for(const char *device);
int ez2_pad_button(int pad, int button);
int ez2_pad_hat_dir(int pad, int hat, int dir);
int ez2_pad_axis(int pad, int axis);

/* The binding page's capture, device half. `want_axes` makes an axis count as
 * a control, which is what binding a turntable needs and what binding a button
 * must not have. */
void ez2_pad_capture_arm(int want_axes);
int  ez2_pad_capture(char *out, int n);

#endif /* EZ2_EZINPUT_H */
