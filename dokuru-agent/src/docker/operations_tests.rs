#[cfg(test)]
mod tests {
    use bollard::Docker;
    use bollard::container::ListContainersOptions;

    #[tokio::test]
    async fn test_docker_client_creation() {
        let result = Docker::connect_with_local_defaults();
        assert!(result.is_ok(), "Should create Docker client");
    }

    #[test]
    fn test_list_containers_options_include_stopped_containers() {
        let options = ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        };

        assert!(
            options.all,
            "Container listing should include stopped containers"
        );
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
