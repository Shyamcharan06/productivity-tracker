# Productivity Tracker on AWS

This document explains what was built on AWS for the Productivity Tracker project, why each piece is there, how to redeploy it, and what to improve next.

Live URL: http://3.7.158.104 (region ap-south-1, Mumbai)

## 1. The project in short

Productivity Tracker is a full-stack app for tasks, habits, Pomodoro focus sessions, distraction tracking, notes, a calendar and an analytics dashboard with two custom scores (productivity and focus).

- Frontend: a single-page vanilla JavaScript app (client/index.html) with Chart.js
- Backend: Node.js 20 and Express, JWT login, bcrypt password hashing
- Database: MongoDB Atlas (managed, outside AWS)
- API surface: /api/auth, /api/tasks, /api/habits, /api/focus, /api/distractions, /api/notes, /api/analytics, /api/health

Before this work the app ran on Netlify (frontend) and Render (backend). It now also runs fully on AWS.

## 2. Architecture

```
Browser
   |  HTTP :80
   v
Elastic IP 3.7.158.104
   |
EC2 t3.micro (Amazon Linux 2023) in a public subnet
   |-- nginx :80
   |     |-- /        -> static client (index.html, API_URL rewritten to /api)
   |     |-- /api/*   -> reverse proxy to 127.0.0.1:3000
   |-- Node/Express (systemd service pt-api) :3000
   |     reads secrets from SSM Parameter Store at start
   v
MongoDB Atlas (over the internet, IP allowlisted to the Elastic IP)
```

nginx serves the frontend and proxies the API on the same origin, so there is no CORS problem and the client only needs a relative /api URL.

## 3. What was implemented on AWS

Everything is defined as code in deploy/cloudformation-ec2.yaml and deployed as the CloudFormation stack productivity-tracker-ec2.

| Area | AWS service | What it does here |
|---|---|---|
| Infrastructure as code | CloudFormation | One template creates and updates every resource below. Re-running it is repeatable and it can be deleted cleanly |
| Network | VPC 10.20.0.0/16, public subnet, internet gateway, route table | A dedicated network. The account had no default VPC in ap-south-1, so one was built |
| Compute | EC2 t3.micro, Amazon Linux 2023 | Runs nginx and the Node API. The AMI is resolved from the public SSM parameter so it is always the latest patched image |
| Provisioning | EC2 UserData (cloud-init) | On first boot installs Node 20, git, nginx, clones the repo, runs npm ci, writes the nginx config and systemd unit |
| Process management | systemd | pt-api restarts automatically if it crashes (Restart=always); nginx starts at boot |
| Static IP | Elastic IP | Gives a fixed address, which is also what is allowlisted in MongoDB Atlas |
| Firewall | Security group | Only TCP 80 is open inbound. No SSH port at all |
| Secrets | SSM Parameter Store (SecureString) | MONGODB_URI and JWT_SECRET are stored encrypted, never in the repo or template |
| Identity | IAM role and instance profile | The instance can read only those two parameters (ssm:GetParameter on their ARNs) |
| Admin access | Systems Manager (AmazonSSMManagedInstanceCore) | Shell access through Session Manager instead of SSH keys |
| Hardening | IMDSv2 required | Blocks the common SSRF route to instance credentials |

### How secrets reach the app

On every start of the pt-api service, a small script (/usr/local/bin/pt-env.sh) asks the instance metadata service for the region, calls `aws ssm get-parameter --with-decryption` for both parameters, and writes them to /run/pt.env (memory-backed, mode 600). The service then loads that file and starts Node. Rotating a secret is therefore just updating the parameter and restarting the service.

### Problems hit and how they were solved

- No default VPC: added our own VPC, subnet, gateway and routes to the template.
- CloudFront was rejected with access denied (the new account is still under AWS verification), so the design was changed from S3 plus CloudFront to a single EC2 instance with nginx. The original CloudFront variant is kept in deploy/cloudformation.yaml for later.
- CloudShell was unavailable for the same verification reason, so the stack was deployed through the console.
- The database connection string was being dropped. The env file is read by the shell, and the `&` characters in an Atlas URI (and any spaces in secrets) were interpreted as shell syntax, so the API silently fell back to localhost MongoDB and every login timed out. The log showed `connect ECONNREFUSED 127.0.0.1:27017`. Fixed by writing the values with `printf %q`, which escapes them safely. Lesson: read the service log before blaming the database allowlist.
- The API service first failed to start because systemd could not load the env file that is created at start time. It now runs through a bash wrapper that fetches and sources the secrets, and nginx is started first so a failure in one does not take down the other. The instance was replaced and /api/health now returns ok.

## 3b. Why each decision was made

These are the reasoning points behind the design, in the order a reviewer is likely to ask about them.

**Why EC2 and not Lambda, Elastic Beanstalk or containers?**
The backend is a long-running Express server with a persistent MongoDB connection. Lambda would need a rewrite to handle cold starts and connection reuse. Beanstalk and ECS hide the details, and the goal here was to show every layer explicitly (network, compute, secrets, access). A single t3.micro is also the cheapest option and fits the free tier.

**Why nginx in front of Node?**
nginx serves the static client directly (fast, no Node involved) and forwards only /api to Node. That puts the site and the API on one origin, so the browser needs no CORS setup and the client only needs a relative /api URL. It also keeps Node on a private local port (3000) instead of exposing it.

**Why SSM Parameter Store and an IAM role for secrets?**
Putting the database string or JWT secret in the repo, the template or the instance's UserData would leak them (UserData is readable). With SecureString parameters the secret is encrypted, and the instance gets it at runtime through an IAM role that can read exactly two parameters. No access keys are stored anywhere. Parameter Store is free, whereas Secrets Manager costs per secret.

**Why CloudFormation (infrastructure as code)?**
The whole environment is one file. It can be reviewed, version-controlled, rebuilt in minutes and deleted cleanly, and an update shows a change set preview before anything changes (this is how we confirmed the monitoring update would not touch the server).

**Why a custom VPC?**
The account had no default VPC in ap-south-1, so the template creates its own network. It is also better practice because nothing else shares it.

**Why an Elastic IP?**
A normal public IP changes on every stop and start. MongoDB Atlas only accepts connections from allowlisted IPs, so the address must stay fixed.

**Why only port 80 and no SSH?**
Fewer open ports means a smaller attack surface. Admin access goes through Session Manager, which uses IAM instead of SSH keys, and is logged.

**Why IMDSv2 only?**
It blocks the common trick of tricking a server into leaking its instance credentials (SSRF), at no cost.

**Why Amazon Linux 2023 resolved from the public SSM parameter?**
The template always picks the latest patched image, with no hardcoded AMI id to go stale.

**Why systemd and Restart=always?**
If Node crashes, it comes back in 5 seconds without anyone logging in. It also starts on boot.

**Why CloudWatch alarms with EC2 auto recovery?**
A single instance is a single point of failure. Recovery restarts it on healthy hardware with the same IP, and the email tells us it happened. This is the cheapest way to get resilience without a second server.

**Why not CloudFront and S3 right away?**
It was the first design (HTTPS, caching, edge delivery). AWS rejected the CloudFront distribution because the new account is still being verified, so the design fell back to EC2 only. The CloudFront template is kept and can be deployed once verification completes.

## 3c. How the application itself works

- The browser loads one HTML file. It calls the REST API under /api with a JWT in the Authorization header.
- Auth: /api/auth/register and /login. Passwords are hashed with bcrypt, and a signed JWT is returned.
- Data (all per user, stored in MongoDB through Mongoose): tasks, habits (with streak counting), focus sessions, distractions, notes.
- Analytics: /api/analytics/daily, weekly and monthly compute two scores. Productivity = 0.4 tasks + 0.3 focus time + 0.2 habits + 0.1 distraction score. Focus = 0.6 average distraction score + 0.4 session completion rate. Both are clamped between 0 and 100.
- /api/health is used for quick uptime checks.

## 4. Is the base deployment enough?

It works, but for a project that is meant to be shown and kept running, it had gaps:

1. Nothing would tell us if the server went down.
2. A hardware fault on the host would leave the site offline until someone noticed.
3. No single place to see CPU, network and health.
4. It is HTTP only and a single instance (no redundancy).

Points 1 to 3 can be fixed cheaply and safely without replacing the instance, so they were added. Point 4 depends on AWS lifting the account verification hold, so it is listed under future work.

## 5. Added: monitoring and self-healing

Added to the same template (validated with cfn-lint; the change set showed only additions, so the server was not replaced):

| Resource | Purpose |
|---|---|
| SNS topic and email subscription | Sends alerts to the AlertEmail parameter (default shyamcb11@gmail.com). The subscription must be confirmed from the email AWS sends |
| CloudWatch alarm SystemStatusAlarm | If the underlying host fails for 2 minutes, EC2 automatically recovers the instance on new hardware and keeps the same IP, and an email is sent |
| CloudWatch alarm InstanceStatusAlarm | If the OS stops responding for 3 minutes, the instance is rebooted automatically and an email is sent |
| CloudWatch alarm HighCpuAlarm | Email if CPU averages above 80 percent for 10 minutes (t3.micro burst credits running out) |
| CloudWatch dashboard productivity-tracker | One page with CPU, network in and out, and status checks |

Status: applied. The stack update ran on 27 Oct 2026 as a change set containing only these 6 new resources (the server itself was not touched) and finished with UPDATE_COMPLETE. The SNS subscription still has to be confirmed from the email AWS sends.

## 6. How to deploy or update

Console route (what was used):
1. CloudFormation, open stack productivity-tracker-ec2, Update, Replace existing template, upload deploy/cloudformation-ec2.yaml.
2. Keep the default parameters (or change AlertEmail), acknowledge IAM, submit.
3. Confirm the SNS subscription email.

Prerequisites (one time):
- SSM Parameter Store SecureStrings /productivity-tracker/MONGODB_URI and /productivity-tracker/JWT_SECRET.
- MongoDB Atlas Network Access allowing the Elastic IP 3.7.158.104/32, and the cluster not paused.

Checks after deploy:
- http://3.7.158.104/api/health returns {"status":"ok"}
- http://3.7.158.104 shows the login page
- Register and log in to confirm the database connection

Open item at the time of writing: a test login still returned a MongoDB buffering timeout after the update, which means Atlas was not yet accepting connections from the server. Fix is on the Atlas side (allowlist entry active, cluster running, correct password in the stored connection string). The app connects on its own once that is correct.

## 7. Security notes

- Secrets live only in SSM and the instance memory, not in git.
- No inbound SSH. Admin access is through Session Manager.
- Port 80 is open to the internet by design for the website.
- The Atlas password was shared in a chat during setup. Rotate it, then update the SSM parameter and restart pt-api (sudo systemctl restart pt-api).
- Traffic is HTTP only for now, so passwords and tokens travel unencrypted. This should be fixed before any real users.

## 8. Cost

A single t3.micro, one Elastic IP in use and a few alarms. Roughly 8 to 10 USD a month after the free tier, and inside the free tier for the first 12 months if the account is eligible. Delete the stack to stop all charges.

## 9. Future improvements

- HTTPS: CloudFront with an ACM certificate (and S3 for the static client) once the account verification completes. The template for that already exists in deploy/cloudformation.yaml.
- Domain name with Route 53.
- Application Load Balancer and an Auto Scaling group across two availability zones for redundancy.
- CloudWatch agent to ship nginx and API logs to CloudWatch Logs.
- Encrypted EBS root volume and AWS Backup snapshots.
- A GitHub Actions pipeline that updates the stack on push.
- Move MongoDB into AWS (DocumentDB) or use Atlas PrivateLink instead of the public internet.

## 10. Files

- deploy/cloudformation-ec2.yaml: the deployed stack plus monitoring
- deploy/cloudformation.yaml: CloudFront and S3 variant (for after verification)
- deploy/deploy.sh: CLI deploy script for the CloudFront variant
- deploy/AWS_DEPLOYMENT.md: this file
