# Handoff checklist

A design is ready for development when every box is ticked. Anything that
cannot be ticked goes on the Handoff page as an open question.

## System

- [ ] Every color, space, radius and type value is a Trix variable — no raw
      values (Figma: _Selection colors_ and _Detached values_ show none).
- [ ] Text uses only the thirteen Trix text styles.
- [ ] The Style Guide page shows the project's brand, type, colors, themes,
      spacing and buttons, and the client has approved it.
- [ ] New tokens are listed with a reason; each was checked against existing
      values first.

## Layout

- [ ] Every page has a Desktop (1440) and a Mobile (375) frame.
- [ ] Sections use section-space padding and a container with a space-scale gap.
- [ ] Layouts sit on the layout grid: every block spans whole columns (span,
      offset), and tablet or mobile frames exist only where the layout differs
      from the automatic stacking.
- [ ] Elements that animate in on scroll are marked (Trix's reveal: fade up,
      one after another).
- [ ] Layout changes at breakpoints are annotated (small 480, medium 768,
      large 992).
- [ ] Themes are set as variable modes on section frames, not hand-colored.

## Components

- [ ] Library components are used as instances, not detached.
- [ ] New components are named for their role and have all their states.
- [ ] Interactive states designed: hover, focus, active, disabled, error.
- [ ] Longest and shortest realistic content checked; empty states designed.

## Content and assets

- [ ] Real copy, or copy marked as placeholder.
- [ ] Heading levels annotated where they differ from the style.
- [ ] Images delivered as originals, at least 2× their 1440 display size, in
      the ratio set.
- [ ] Icons named (Phosphor name and weight) or delivered as 24×24 SVGs.
- [ ] Logo as SVG; favicon (square SVG), webclip (180×180) and social image
      (1200×630) designed.
- [ ] Fonts: names, weights and licence; files delivered if not on Google Fonts.

## Behaviour

- [ ] Links and destinations annotated.
- [ ] Forms: fields, required, validation messages, success state, where
      submissions go.
- [ ] Motion annotated: trigger, property, distance, duration, easing — and
      what the page looks like with motion off.
- [ ] Hover-only interactions have a Mobile equivalent.
