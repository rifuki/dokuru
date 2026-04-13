use crate::types::{CisRule, RuleCategory, Severity};

pub fn get_all_rules() -> Vec<CisRule> {
    vec![
        // Namespace Rules (6)
        CisRule {
            id: "2.10".to_string(),
            title: "Enable user namespace support".to_string(),
            category: RuleCategory::Namespace,
            severity: Severity::High,
            section: "Daemon".to_string(),
            description: "User namespaces restrict the privileges of a user within a container.".to_string(),
            remediation: "Ensure that 'userns-remap' is configured in /etc/docker/daemon.json.".to_string(),
        },
        CisRule {
            id: "5.10".to_string(),
            title: "Host's network namespace not shared".to_string(),
            category: RuleCategory::Namespace,
            severity: Severity::Medium,
            section: "Container Runtime".to_string(),
            description: "Do not use '--net=host' when starting a container so it does not share the host's network namespace.".to_string(),
            remediation: "Run the container without '--net=host'.".to_string(),
        },
        CisRule {
            id: "5.16".to_string(),
            title: "Host's process namespace not shared".to_string(),
            category: RuleCategory::Namespace,
            severity: Severity::High,
            section: "Container Runtime".to_string(),
            description: "A container should not share the host's process namespace, preventing it from seeing or interacting with host processes.".to_string(),
            remediation: "Do not start a container with '--pid=host'.".to_string(),
        },
        CisRule {
            id: "5.17".to_string(),
            title: "Host's IPC namespace not shared".to_string(),
            category: RuleCategory::Namespace,
            severity: Severity::Medium,
            section: "Container Runtime".to_string(),
            description: "A container should not share the host's IPC namespace, preventing IPC communication with the host.".to_string(),
            remediation: "Do not start a container with '--ipc=host'.".to_string(),
        },
        CisRule {
            id: "5.21".to_string(),
            title: "Host's UTS namespace not shared".to_string(),
            category: RuleCategory::Namespace,
            severity: Severity::Medium,
            section: "Container Runtime".to_string(),
            description: "A container should not share the host's UTS namespace, allowing the container to have its own hostname.".to_string(),
            remediation: "Do not start a container with '--uts=host'.".to_string(),
        },
        CisRule {
            id: "5.31".to_string(),
            title: "Host's user namespaces not shared".to_string(),
            category: RuleCategory::Namespace,
            severity: Severity::High,
            section: "Container Runtime".to_string(),
            description: "A container should not share the host's user namespaces.".to_string(),
            remediation: "Do not start a container with '--userns=host'.".to_string(),
        },

        // Cgroup Rules (6)
        CisRule {
            id: "2.11".to_string(),
            title: "Default cgroup usage confirmed".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            section: "Daemon".to_string(),
            description: "It is a good practice to use the default cgroup-parent for containers, avoiding assigning them to custom, potentially conflicting cgroups.".to_string(),
            remediation: "Review /etc/docker/daemon.json and ensure 'cgroup-parent' is not improperly configured.".to_string(),
        },
        CisRule {
            id: "5.11".to_string(),
            title: "Memory usage limited".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::High,
            section: "Container Runtime".to_string(),
            description: "By default, all containers can use as much memory as they need. This could lead to a Denial of Service.".to_string(),
            remediation: "Start a container with '--memory' parameter.".to_string(),
        },
        CisRule {
            id: "5.12".to_string(),
            title: "CPU priority set appropriately".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            section: "Container Runtime".to_string(),
            description: "By default, all containers get the same proportion of CPU cycles. This rule checks if CPU shares are explicitly configured.".to_string(),
            remediation: "Start a container with '--cpu-shares' parameter.".to_string(),
        },
        CisRule {
            id: "5.25".to_string(),
            title: "Cgroup usage confirmed (no privileged)".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::High,
            section: "Container Runtime".to_string(),
            description: "Privileged containers can break cgroup isolations trivially.".to_string(),
            remediation: "Avoid using '--privileged' when starting a container.".to_string(),
        },
        CisRule {
            id: "5.26".to_string(),
            title: "Restricted from additional privileges".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::High,
            section: "Container Runtime".to_string(),
            description: "A process can acquire more privileges than from its parent, preventing this limits attack surface.".to_string(),
            remediation: "Start a container with '--security-opt=no-new-privileges'.".to_string(),
        },
        CisRule {
            id: "5.29".to_string(),
            title: "PIDs cgroup limit used".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            section: "Container Runtime".to_string(),
            description: "Use --pids-limit to prevent fork bombs and limit the number of processes in a container.".to_string(),
            remediation: "Start a container with '--pids-limit' parameter.".to_string(),
        },
    ]
}

pub fn get_rule_by_id(id: &str) -> Option<CisRule> {
    get_all_rules().into_iter().find(|r| r.id == id)
}
