# Home Assistant Snow Detection

This small program will, at a configurable interval, download a static image from a given camera URL that's capable of producing static images.

It'll then mask a configurable area from the downloaded image and analyze that area for the presence or absence of snow.

It'll then report back to HA (**Home Assistant**) whether snow is present or not via an API call to update a configurable `input_boolean` entity (`on` or `off`).


## How to Setup & Run

1. Create a new `input_boolean` entity in HA -> Devices & Services -> Helpers ->  Toggle (note its ID)
2. Copy the `setenv.template.sh` file to `setenv.sh`
3. Edit the contents of `setenv.sh` to have it match your environment specifics
4. Source the `setenv.sh` file to setup your environment variables
5. Run the app using `node index.js`
      or optionally use the `docker.sh` script to build Docker image + container
