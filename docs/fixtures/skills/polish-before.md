deploy notes

**Before you start**
you need access to the prod cluster and you should probably make sure the migrations have been run first because if they have not been run the app will crash on boot, this has happened twice. Also IMPORTANT never deploy on fridays after 3pm.

To deploy first you pull main then you run make build and wait for it to finish (takes about 4 minutes) then run make deploy ENV=staging and check the staging dashboard at https://staging.example.com/health and if it says ok you can run make deploy ENV=prod, if it does not say ok roll back with make rollback ENV=staging and ask in #deploys.

staging vs prod: staging has 1 replica and uses the test payment key and deploys take about 2 minutes, prod has 6 replicas and uses the live payment key and deploys take about 10 minutes because of the rolling restart.
