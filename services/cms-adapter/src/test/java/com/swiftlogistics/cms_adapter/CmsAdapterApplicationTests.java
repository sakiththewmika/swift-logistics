package com.swiftlogistics.cms_adapter;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Boots the context under the hermetic "test" profile: no database, broker or registry is contacted. */
@SpringBootTest
@ActiveProfiles("test")
class CmsAdapterApplicationTests {

	@Test
	void contextLoads() {
	}

}
