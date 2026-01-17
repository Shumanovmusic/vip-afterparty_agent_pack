Title: API Documentation

URL Source: https://stake-engine.com/docs

Markdown Content:
API Documentation
===============

[![Image 2: stake engine logo](https://stake-engine.com/stake-engine-dark.png)](https://stake-engine.com/)Toggle theme

[Getting Started ---------------](https://stake-engine.com/docs)

[Introduction](https://stake-engine.com/docs)

[RGS Details](https://stake-engine.com/docs/rgs)

[Wallet Endpoints](https://stake-engine.com/docs/rgs/wallet)

[Basic RGS Example](https://stake-engine.com/docs/rgs/example)

[Front End ---------](https://stake-engine.com/docs/front-end)

[Introduction](https://stake-engine.com/docs/front-end)

[Dependencies](https://stake-engine.com/docs/front-end/dependencies)

[Getting Started](https://stake-engine.com/docs/front-end/getting-started)

[Storybook](https://stake-engine.com/docs/front-end/storybook)

[Flowchart](https://stake-engine.com/docs/front-end/flowchart)

[Task Breakdown](https://stake-engine.com/docs/front-end/task-breakdown)

[Adding new events](https://stake-engine.com/docs/front-end/adding-new-events)

[File Structure](https://stake-engine.com/docs/front-end/file-structure)

[Context](https://stake-engine.com/docs/front-end/context)

[UI](https://stake-engine.com/docs/front-end/ui)

[Math ----](https://stake-engine.com/docs/math)

[Introduction](https://stake-engine.com/docs/math)

[Setup](https://stake-engine.com/docs/math/setup)

[Quickstart Guide](https://stake-engine.com/docs/math/quick-start)

[Math File Format](https://stake-engine.com/docs/math/math-file-format)

[SDK Directory](https://stake-engine.com/docs/math/sdk-directory)

[High-Level Structure](https://stake-engine.com/docs/math/high-level-structure)

[State Machine](https://stake-engine.com/docs/math/high-level-structure/state-machine)

[Game Structure](https://stake-engine.com/docs/math/high-level-structure/game-structure)

[Game Format](https://stake-engine.com/docs/math/high-level-structure/game-format)

[Game State Structure](https://stake-engine.com/docs/math/game-state-structure)

[Simulation Acceptance](https://stake-engine.com/docs/math/game-state-structure/simulation-acceptance)

[Setup](https://stake-engine.com/docs/math/game-state-structure/setup/configs)

[Configs](https://stake-engine.com/docs/math/game-state-structure/setup/configs)

[Betmode](https://stake-engine.com/docs/math/game-state-structure/setup/betmode)

[Distribution](https://stake-engine.com/docs/math/game-state-structure/setup/distribution)

[Source Files](https://stake-engine.com/docs/math/source-files)

[Config](https://stake-engine.com/docs/math/source-files/config)

[Events](https://stake-engine.com/docs/math/source-files/events)

[Executables](https://stake-engine.com/docs/math/source-files/executables)

[State](https://stake-engine.com/docs/math/source-files/state)

[Win Manager](https://stake-engine.com/docs/math/source-files/win-manager)

[Outputs](https://stake-engine.com/docs/math/source-files/outputs)

[Calculations](https://stake-engine.com/docs/math/source-files/calculations)

[Board](https://stake-engine.com/docs/math/source-files/calculations/board)

[Tumble](https://stake-engine.com/docs/math/source-files/calculations/tumble)

[Lines](https://stake-engine.com/docs/math/source-files/calculations/lines)

[Ways](https://stake-engine.com/docs/math/source-files/calculations/ways)

[Scatter](https://stake-engine.com/docs/math/source-files/calculations/scatter)

[Cluster](https://stake-engine.com/docs/math/source-files/calculations/cluster)

[Symbols](https://stake-engine.com/docs/math/game-state-structure/symbols)

[Board](https://stake-engine.com/docs/math/game-state-structure/board)

[Wins](https://stake-engine.com/docs/math/game-state-structure/wins)

[Events](https://stake-engine.com/docs/math/game-state-structure/events)

[Force Files](https://stake-engine.com/docs/math/game-state-structure/force-files)

[Utilities](https://stake-engine.com/docs/math/utilities)

[Example Games](https://stake-engine.com/docs/math/example-games)

[Optimization Algorithm](https://stake-engine.com/docs/math/optimization-algorithm)

[Approval Guidelines -------------------](https://stake-engine.com/docs/approval-guidelines)

[General Requirements](https://stake-engine.com/docs/approval-guidelines)

[Game Quality Rankings](https://stake-engine.com/docs/approval-guidelines/game-quality-rankings)

[RGS Communication](https://stake-engine.com/docs/approval-guidelines/rgs-communication)

[Front End Communication](https://stake-engine.com/docs/approval-guidelines/front-end-communication)

[Math Verification](https://stake-engine.com/docs/approval-guidelines/math-verification)

[Game Tile Requirements](https://stake-engine.com/docs/approval-guidelines/game-tile-requirements)

[General Disclaimer](https://stake-engine.com/docs/approval-guidelines/general-disclaimer)

[Jurisdiction Requirements](https://stake-engine.com/docs/approval-guidelines/jurisdiction-requirements)

[Legal -----](https://stake-engine.com/docs/terms)

[Terms & Conditions](https://stake-engine.com/docs/terms)

[Privacy Policy](https://stake-engine.com/docs/privacy)

Open sidebar[![Image 3: stake engine logo](https://stake-engine.com/stake-engine-dark.png)](https://stake-engine.com/)

Toggle theme

API Documentation
=================

The Stake Development Kit is a comprehensive framework designed to simplify the creation, simulation, and optimization of slot games. Whether you're an independent developer or part of a dedicated studio, the SDK empowers you to bring your gaming vision to life with precision and efficiency. By leveraging the Carrot Remote Gaming Server (RGS), developers can seamlessly integrate their games on [Stake.com](https://stake.com/), facilitating smooth and scalable deployments.

### What Does the SDK Offer?

The SDK is an optional software package handling both the client-side rendering of games in-browser, and the generation of static files containing all possible game results.

1.   **Math Framework**: A Python-based engine for defining game rules, simulating outcomes, and optimizing win distributions. It generates all necessary backend and configuration files, lookup tables, and simulation results.
2.   **Frontend Framework**: A PixieJS/Svelte-based toolkit for creating visually engaging slot games. This component integrates seamlessly with the math engine's outputs, ensuring consistency between game logic and player experience.

Stake Engine Game Format Criteria
---------------------------------

For verification, testing and security purposes, games uploaded to Stake Engine must consist of static files. Developers utilizing their own frontend and/or math solutions are welcome to upload compatible file-formats to the Admin Control Panel (ACP). All possible game-outcomes must be contained within compressed game-files, typically separated out by modes. Each outcome must be mapped to a corresponding CSV file summarizing a single game-round by a simulation number, probability of selection, and final payout multiplier. When a betting round is initiated a simulation number is selected at a frequency proportional to the simulation weighting, and the corresponding game events are returned though the `/play` API response.

![Image 4: RGS NBG Diagram](https://stake-engine.com/docs-content/rgs-nbg-im.png)
