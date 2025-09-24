# lambda-muhammara

This repository contains only the pre-built binary for running muhammara in an AWS Lambda function.  This is so you can deploy muhammara to a Lambda function from a Windows machine.  
To do so:
```
npm install muhammara --save
npm install lambda-muhammara --save
copy node_modules/muhammara/binding/muhammara.node node_modules/muhammara/binding/muhammara_backupForMyOS.node
copy node_modules/lambda-muhammara/binding/muhammara.node node_modules/muhammara/binding/muhammara.node
```

And then deploy your lambda function as you would normally.

# Version history:
1. Use Version1 for AWS Lambda Node 14.17.X

2.5 Updated for Muhamara 2.5 (AWS Lambda Node 14.17.X)

3.5 Updated for Muhamara 3.5 (AWS Lambda Node 14.17.X)

3.8 Updated for Muhamara 3.8 (AWS Lambda Node 14.17.X)

3.8.16 Updated for Muhamara 3.8 (AWS Lambda Node 16.20.X)

4.0 Updated for Muhamara 4.0 (AWS Lambda Node 16.20.X)

5.3.1 Updated for Muhamara 5.3.0 (AWS Lambda Node 20.19.X)
