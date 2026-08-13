# Beatstar Script

`agent` - contains the script injected into the APK

`device` - contains the script that will be loaded over the network

`functions` - split up utility functions with a single purpose

`hacks` - anything that interacts with gameplay in some way

`lib` - utility functions mostly for creating a base custom chart

# Compiling

    1. `npm install`
    2. `npm run device`
    3. script.js is created with the device script

# Compiling agent
    1. `npm install`
    2. `npm run build`
    3. _agent.js is created to be injected into the APK