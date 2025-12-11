# PostgreSQL on Free-Tier Compute Engine
#
# Provisions an e2-micro instance (free tier eligible) running PostgreSQL
# for @effect/workflow persistence via @effect/cluster's ClusterWorkflowEngine.
#
# Architecture:
# - Single e2-micro (0.25 vCPU, 1GB RAM) - free tier in us-central1
# - PostgreSQL 15 via Docker
# - Persistent disk for data durability
# - Internal VPC access only (Cloud Run via VPC connector)

# -----------------------------------------------------------------------------
# Network
# -----------------------------------------------------------------------------

resource "google_compute_network" "workflow_vpc" {
  name                    = "workflow-vpc-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "workflow_subnet" {
  name          = "workflow-subnet-${var.environment}"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.workflow_vpc.id

  private_ip_google_access = true
}

# VPC Connector for Cloud Run to access Compute Engine
resource "google_vpc_access_connector" "workflow_connector" {
  name          = "workflow-connector-${var.environment}"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.workflow_vpc.name

  min_instances = 2
  max_instances = 3
}

# Firewall: Allow internal traffic on PostgreSQL port
resource "google_compute_firewall" "allow_postgres" {
  name    = "allow-postgres-${var.environment}"
  network = google_compute_network.workflow_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }

  source_ranges = ["10.0.0.0/8"]
  target_tags   = ["postgres"]
}

# Firewall: Allow SSH for maintenance (optional, from IAP)
resource "google_compute_firewall" "allow_ssh_iap" {
  name    = "allow-ssh-iap-${var.environment}"
  network = google_compute_network.workflow_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP's IP range for secure SSH tunneling
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["postgres"]
}

# -----------------------------------------------------------------------------
# Compute Engine Instance
# -----------------------------------------------------------------------------

resource "google_compute_instance" "postgres" {
  name         = "workflow-postgres-${var.environment}"
  machine_type = "e2-micro" # Free tier eligible
  zone         = "${var.region}-a"

  tags = ["postgres"]

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable" # Container-Optimized OS
      size  = 30                     # 30GB standard persistent disk (free tier)
      type  = "pd-standard"
    }
  }

  # Attach persistent disk for PostgreSQL data
  attached_disk {
    source      = google_compute_disk.postgres_data.self_link
    device_name = "postgres-data"
    mode        = "READ_WRITE"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.workflow_subnet.self_link

    # No external IP - access via IAP or VPC only
    # Uncomment for debugging:
    # access_config {}
  }

  metadata = {
    # Cloud-init script to start PostgreSQL container
    gce-container-declaration = yamlencode({
      spec = {
        containers = [{
          name  = "postgres"
          image = "postgres:15-alpine"
          env = [
            { name = "POSTGRES_USER", value = "workflow" },
            { name = "POSTGRES_DB", value = "workflow" },
            { name = "POSTGRES_PASSWORD_FILE", value = "/run/secrets/pg_password" }
          ]
          volumeMounts = [
            { name = "postgres-data", mountPath = "/var/lib/postgresql/data" },
            { name = "pg-password", mountPath = "/run/secrets", readOnly = true }
          ]
          ports = [{ containerPort = 5432 }]
        }]
        volumes = [
          { name = "postgres-data", gcePersistentDisk = { pdName = "postgres-data", fsType = "ext4" } },
          { name = "pg-password", secret = { secretName = var.postgres_password_secret_id } }
        ]
        restartPolicy = "Always"
      }
    })

    # Enable container-optimized OS logging
    google-logging-enabled = "true"
  }

  service_account {
    email  = var.service_account_email
    scopes = ["cloud-platform"]
  }

  scheduling {
    preemptible       = false
    automatic_restart = true
  }

  allow_stopping_for_update = true

  lifecycle {
    ignore_changes = [metadata["ssh-keys"]]
  }
}

# Persistent disk for PostgreSQL data
resource "google_compute_disk" "postgres_data" {
  name = "postgres-data-${var.environment}"
  type = "pd-standard"
  zone = "${var.region}-a"
  size = 10 # 10GB for workflow data

  labels = {
    environment = var.environment
    purpose     = "workflow-persistence"
  }
}

# Static internal IP for consistent DNS
resource "google_compute_address" "postgres_internal" {
  name         = "postgres-internal-${var.environment}"
  subnetwork   = google_compute_subnetwork.workflow_subnet.id
  address_type = "INTERNAL"
  region       = var.region
  purpose      = "GCE_ENDPOINT"
}
