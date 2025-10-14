# Deployment Guide

Complete deployment guide for Document Control Microservice across different environments.

## Table of Contents

- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [AWS EKS Deployment](#aws-eks-deployment)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites

- Node.js 18+
- Access to AWS S3 and KMS (or LocalStack for local testing)
- TSA endpoint access (or use public TSA like DigiCert)

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Validate configuration:**
```bash
npm run validate-env
```

4. **Run locally:**
```bash
# Development with hot reload
npm run dev

# Production mode
npm start
```

5. **Test the API:**
```bash
# Health check
curl http://localhost:3000/health

# View metrics
curl http://localhost:3000/metrics
```

---

## Docker Deployment

### Single Container

1. **Build the image:**
```bash
docker build -t document-control:latest .
```

2. **Run the container:**
```bash
docker run -d \
  --name document-control \
  -p 3000:3000 \
  -v $(pwd)/../template:/app/templates:ro \
  --env-file .env \
  document-control:latest
```

3. **View logs:**
```bash
docker logs -f document-control
```

4. **Stop and remove:**
```bash
docker stop document-control
docker rm document-control
```

### Docker Compose (Full Stack)

1. **Start all services:**
```bash
docker-compose up -d
```

This starts:
- Document Control service (port 3000)
- LocalStack for S3/KMS (port 4566)
- Prometheus (port 9090)
- Grafana (port 3001)

2. **View logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f document-control
```

3. **Access services:**
- API: http://localhost:3000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- LocalStack: http://localhost:4566

4. **Stop services:**
```bash
docker-compose down

# Remove volumes too
docker-compose down -v
```

### LocalStack S3 Setup

For local development without AWS:

```bash
# Create S3 bucket in LocalStack
aws --endpoint-url=http://localhost:4566 s3 mb s3://document-control-bucket

# List buckets
aws --endpoint-url=http://localhost:4566 s3 ls

# Update .env
S3_BUCKET=document-control-bucket
AWS_REGION=us-east-1
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured
- Container registry access

### 1. Build and Push Image

```bash
# Build
docker build -t your-registry/document-control:1.0.0 .

# Push
docker push your-registry/document-control:1.0.0
```

### 2. Create Kubernetes Manifests

Create `k8s/namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: document-control
```

Create `k8s/configmap.yaml`:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: document-control-config
  namespace: document-control
data:
  PORT: "3000"
  NODE_ENV: "production"
  AUTH_MODE: "jwt"
  AWS_REGION: "us-east-1"
  S3_PREFIX: "publish/"
  TEMPLATE_ROOT: "/app/templates"
  TSA_URL_PROD: "http://timestamp.digicert.com"
  TSA_TIMEOUT_MS: "4000"
  TSA_RETRIES: "2"
  IDEMPOTENCY_TTL_SECONDS: "86400"
  MAX_INPUT_SIZE_MB: "15"
```

Create `k8s/secret.yaml`:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: document-control-secrets
  namespace: document-control
type: Opaque
stringData:
  COGNITO_ISSUER: "https://cognito-idp.us-east-1.amazonaws.com/..."
  COGNITO_JWKS_URI: "https://cognito-idp.us-east-1.amazonaws.com/.../jwks.json"
  COGNITO_CLIENT_ID: "your-client-id"
  COGNITO_CLIENT_SECRET: "your-client-secret"
  S3_BUCKET: "your-bucket"
  KMS_KEY_ARN: "arn:aws:kms:us-east-1:..."
```

Create `k8s/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: document-control
  namespace: document-control
  labels:
    app: document-control
spec:
  replicas: 3
  selector:
    matchLabels:
      app: document-control
  template:
    metadata:
      labels:
        app: document-control
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: document-control-sa
      containers:
      - name: document-control
        image: your-registry/document-control:1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        envFrom:
        - configMapRef:
            name: document-control-config
        - secretRef:
            name: document-control-secrets
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        volumeMounts:
        - name: templates
          mountPath: /app/templates
          readOnly: true
      volumes:
      - name: templates
        configMap:
          name: document-control-templates
```

Create `k8s/service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: document-control
  namespace: document-control
  labels:
    app: document-control
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  selector:
    app: document-control
```

Create `k8s/ingress.yaml`:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: document-control
  namespace: document-control
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: document-control-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: document-control
            port:
              number: 80
```

Create `k8s/serviceaccount.yaml`:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: document-control-sa
  namespace: document-control
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT_ID:role/document-control-role
```

Create `k8s/hpa.yaml` (Horizontal Pod Autoscaler):
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: document-control
  namespace: document-control
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: document-control
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 3. Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply configurations
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/serviceaccount.yaml

# Deploy application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Check status
kubectl get pods -n document-control
kubectl get svc -n document-control
kubectl get ingress -n document-control

# View logs
kubectl logs -f deployment/document-control -n document-control

# Check metrics
kubectl top pods -n document-control
```

---

## AWS EKS Deployment

### Prerequisites

- AWS CLI configured
- eksctl installed
- kubectl installed

### 1. Create EKS Cluster

```bash
eksctl create cluster \
  --name document-control-cluster \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed
```

### 2. Configure IAM Role for Service Account (IRSA)

Create IAM policy `document-control-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject",
        "s3:PutObjectRetention",
        "s3:GetObjectRetention"
      ],
      "Resource": "arn:aws:s3:::your-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-bucket"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"
    }
  ]
}
```

Create IAM role:
```bash
# Create policy
aws iam create-policy \
  --policy-name DocumentControlPolicy \
  --policy-document file://document-control-policy.json

# Create IAM role for service account
eksctl create iamserviceaccount \
  --name document-control-sa \
  --namespace document-control \
  --cluster document-control-cluster \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/DocumentControlPolicy \
  --approve \
  --override-existing-serviceaccounts
```

### 3. Set up S3 Bucket with Object Lock

```bash
# Create bucket with Object Lock
aws s3api create-bucket \
  --bucket document-control-prod \
  --region us-east-1 \
  --object-lock-enabled-for-bucket

# Configure default retention
aws s3api put-object-lock-configuration \
  --bucket document-control-prod \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "GOVERNANCE",
        "Days": 365
      }
    }
  }'

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket document-control-prod \
  --versioning-configuration Status=Enabled
```

### 4. Create KMS Key

```bash
# Create KMS key
aws kms create-key \
  --description "Document Control Encryption Key" \
  --key-policy file://kms-policy.json

# Create alias
aws kms create-alias \
  --alias-name alias/document-control \
  --target-key-id KEY_ID
```

### 5. Configure Cognito

```bash
# Create user pool
aws cognito-idp create-user-pool \
  --pool-name document-control-pool \
  --auto-verified-attributes email

# Create app client
aws cognito-idp create-user-pool-client \
  --user-pool-id USER_POOL_ID \
  --client-name document-control-client \
  --generate-secret \
  --allowed-o-auth-flows client_credentials \
  --allowed-o-auth-scopes "publish:doc" "publish:chk" "jobs:read"
```

### 6. Deploy Application

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --region us-east-1 \
  --name document-control-cluster

# Deploy
kubectl apply -f k8s/

# Watch rollout
kubectl rollout status deployment/document-control -n document-control
```

### 7. Install ALB Ingress Controller

```bash
# Install ALB controller
kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller/crds"

eksctl create iamserviceaccount \
  --cluster=document-control-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::aws:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=document-control-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

---

## Configuration

### Environment Variables Checklist

**Required:**
- [ ] `AUTH_MODE` (jwt or mtls)
- [ ] `COGNITO_ISSUER`
- [ ] `COGNITO_JWKS_URI`
- [ ] `AWS_REGION`
- [ ] `S3_BUCKET`
- [ ] `KMS_KEY_ARN`
- [ ] `TSA_URL_PROD`

**Optional (with defaults):**
- [ ] `PORT` (default: 3000)
- [ ] `NODE_ENV` (default: development)
- [ ] `S3_PREFIX` (default: publish/)
- [ ] `TEMPLATE_ROOT` (default: ../template)

### Secrets Management

**Development:**
- Use `.env` file (gitignored)

**Docker:**
- Use `--env-file` flag
- Or mount secrets as volumes

**Kubernetes:**
- Use Kubernetes Secrets
- Or AWS Secrets Manager with External Secrets Operator
- Or HashiCorp Vault

**Example with AWS Secrets Manager:**
```bash
# Store secret
aws secretsmanager create-secret \
  --name document-control/cognito \
  --secret-string '{"client_id":"xxx","client_secret":"yyy"}'

# Use External Secrets Operator to sync to K8s
```

---

## Monitoring Setup

### Prometheus

**Scrape configuration** (already in prometheus.yml):
```yaml
scrape_configs:
  - job_name: 'document-control'
    static_configs:
      - targets: ['document-control:3000']
    metrics_path: '/metrics'
```

### Grafana Dashboard

1. **Import dashboard:**
   - Go to Grafana → Dashboards → Import
   - Use Node.js dashboard (ID: 11159)
   - Add custom panels for job metrics

2. **Custom Panels:**
   - Job processing duration (p95, p99)
   - TSA request latency
   - S3 upload size/duration
   - Active jobs count
   - Error rates

### CloudWatch (AWS)

**Enable Container Insights:**
```bash
eksctl utils install-aws-node-termination-handler \
  --cluster document-control-cluster

aws eks create-addon \
  --cluster-name document-control-cluster \
  --addon-name amazon-cloudwatch-observability
```

### Alerts

Create alerting rules for:
- High error rate (> 5%)
- TSA failures
- S3 upload failures
- High memory usage (> 90%)
- Pod restart loops

---

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod POD_NAME -n document-control

# Check logs
kubectl logs POD_NAME -n document-control

# Common issues:
# - Image pull errors → Check registry credentials
# - ConfigMap/Secret missing → Apply configs first
# - Health check failing → Check health endpoint
```

### S3 Access Denied

```bash
# Verify IAM role
kubectl describe sa document-control-sa -n document-control

# Test S3 access from pod
kubectl exec -it POD_NAME -n document-control -- sh
aws s3 ls s3://your-bucket/

# Check IAM policy attachment
aws iam list-attached-role-policies --role-name ROLE_NAME
```

### TSA Connection Issues

```bash
# Test TSA from pod
kubectl exec -it POD_NAME -n document-control -- sh
curl -v http://timestamp.digicert.com

# Check network policies
kubectl get networkpolicies -n document-control

# Verify firewall rules
# TSA usually needs outbound HTTPS (443) or HTTP (80)
```

### Memory Issues

```bash
# Check memory usage
kubectl top pods -n document-control

# Increase memory limits in deployment.yaml
# resources.limits.memory: "4Gi"

# Enable Node.js heap profiling
NODE_OPTIONS="--max-old-space-size=1536"
```

### Performance Issues

```bash
# Check HPA status
kubectl get hpa -n document-control

# Scale manually if needed
kubectl scale deployment/document-control --replicas=5 -n document-control

# Check metrics
curl http://POD_IP:3000/metrics | grep job_processing
```

---

## Rollback

### Docker

```bash
# Tag specific version
docker tag document-control:latest document-control:1.0.0

# Rollback
docker stop document-control
docker rm document-control
docker run -d ... document-control:1.0.0
```

### Kubernetes

```bash
# View rollout history
kubectl rollout history deployment/document-control -n document-control

# Rollback to previous version
kubectl rollout undo deployment/document-control -n document-control

# Rollback to specific revision
kubectl rollout undo deployment/document-control -n document-control --to-revision=2
```

---

## Cleanup

### Local

```bash
docker-compose down -v
rm -rf logs/
```

### Kubernetes

```bash
kubectl delete namespace document-control
```

### AWS EKS

```bash
# Delete cluster
eksctl delete cluster --name document-control-cluster

# Delete S3 bucket (careful!)
aws s3 rb s3://document-control-prod --force

# Delete KMS key (schedules deletion)
aws kms schedule-key-deletion --key-id KEY_ID --pending-window-in-days 7
```

---

## Production Checklist

Before going live:

- [ ] All secrets configured properly
- [ ] S3 bucket with Object Lock enabled
- [ ] KMS key created and accessible
- [ ] Cognito configured with proper scopes
- [ ] TSA endpoint tested and accessible
- [ ] SSL/TLS certificates configured
- [ ] Monitoring and alerting set up
- [ ] Log aggregation configured
- [ ] Backup strategy defined
- [ ] Disaster recovery plan documented
- [ ] Load testing completed
- [ ] Security audit performed
- [ ] Documentation reviewed
- [ ] Team trained on operations

---

**Need Help?** Contact: support@passfy.com
