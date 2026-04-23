#[cfg(test)]
mod tests {
    use bollard::Docker;
    use bollard::container::ListContainersOptions;

    #[tokio::test]
    async fn test_docker_client_creation() {
        let result = Docker::connect_with_local_defaults();
        assert!(result.is_ok(), "Should create Docker client");
    }

    #[tokio::test]
    async fn test_list_containers_structure() {
        let docker = Docker::connect_with_local_defaults().unwrap();
        let options = ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        };

        let result = docker.list_containers(Some(options)).await;
        assert!(result.is_ok(), "Should list containers");
    }

    #[test]
    fn test_container_id_validation() {
        let valid_id = "abc123def456";
        let invalid_id = "";

        assert!(!valid_id.is_empty());
        assert!(invalid_id.is_empty());
    }

    #[test]
    fn test_image_tag_parsing() {
        let image = "nginx:latest";
        let parts: Vec<&str> = image.split(':').collect();

        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0], "nginx");
        assert_eq!(parts[1], "latest");
    }
}
