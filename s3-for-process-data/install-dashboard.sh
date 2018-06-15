#!/bin/bash

aws cloudformation create-stack --stack-name ProcessADashboard \
--template-body file://dashboard.yml